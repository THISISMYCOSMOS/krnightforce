// Red-team checks against the spike's conclusions. Each prints one verdict.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from '../managed/red/contract/index.js';

const PK = '0'.repeat(64);
const hex = (u) => Buffer.from(u).toString('hex');
const plain = (v) => v instanceof Uint8Array ? hex(v) : typeof v === 'bigint' ? v.toString()
  : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
const key = (s) => { const b = new Uint8Array(32); b[0] = s; return b; };

async function deploy(w) {
  const c = new Contract({
    secret_num: (ctx) => [ctx.privateState, w.num],
    owner_sk: (ctx) => [ctx.privateState, w.sk],
  });
  const init = await c.initialState(rt.createConstructorContext({}, PK));
  return { c, w, state: init.currentContractState.data };
}
async function call(env, id) {
  const ctx = rt.createCircuitContext({ circuitId: id, contractAddress: rt.DUMMY_ADDRESS,
    coinPublicKeyOrZswapState: PK, contractState: env.state, privateState: {} });
  try {
    const res = await env.c.circuits[id](ctx);
    env.state = res.context.callContext.currentQueryContext.state;
    return { ok: true, result: plain(res.result), traces: res.context.callProofDataTrace.length,
      transcript: plain(res.context.callProofDataTrace.at(-1).publicTranscript) };
  } catch (e) { return { ok: false, err: String(e.message ?? e).slice(0, 80) }; }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const out = {};

// R5: one random pair (both > 100) vs boundary values.
{
  const a = await call(await deploy({ num: 4821n, sk: key(1) }), 'threshold');
  const b = await call(await deploy({ num: 9157n, sk: key(1) }), 'threshold');
  const c = await call(await deploy({ num: 7n, sk: key(1) }), 'threshold');
  out.R5_randomPairCaught = !same(a.transcript, b.transcript);
  out.R5_boundaryPairCaught = !same(a.transcript, c.transcript);
}
// R2: leak only via return value.
{
  const a = await call(await deploy({ num: 11n, sk: key(1) }), 'getBack');
  const b = await call(await deploy({ num: 22n, sk: key(1) }), 'getBack');
  out.R2_transcriptDiffers = !same(a.transcript, b.transcript);
  out.R2_resultDiffers = !same(a.result, b.result);
  out.R2_transcriptOps = a.transcript.length;
}
// R9: ownership. Naive: deploy with sk=1, then vary sk at call time.
{
  const env1 = await deploy({ num: 0n, sk: key(1) });
  const env2 = await deploy({ num: 0n, sk: key(1) });
  env2.w.sk = key(2);
  const a = await call(env1, 'act');
  const b = await call(env2, 'act');
  out.R9_naiveSecondRun = b.ok ? 'ran' : `aborted: ${b.err}`;
  // Consistent: whole scenario (constructor + call) with each secret.
  const c = await call(await deploy({ num: 0n, sk: key(1) }), 'act');
  const d = await call(await deploy({ num: 0n, sk: key(2) }), 'act');
  out.R9_scenarioBothRan = c.ok && d.ok;
  out.R9_scenarioCallTranscriptDiffers = !same(c.transcript, d.transcript);
}
// R3: helper circuit.
{
  const a = await call(await deploy({ num: 0n, sk: key(1) }), 'viaHelper');
  out.R3_traceEntries = a.traces;
  out.R3_transcriptOps = a.transcript.length;
}
console.log('JSON', JSON.stringify(out));
