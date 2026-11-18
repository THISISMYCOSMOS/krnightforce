// Spike: can we run a compiled Compact contract, read what lands on chain
// (publicTranscript + ledger), and use it for differential (A1), inversion (A2)
// and path (A5) attacks? Also checks determinism and timing.
//
// Run: see README.md in this folder.
import * as rt from '@midnight-ntwrk/compact-runtime';
import { Contract, ledger } from './managed/vault/contract/index.js';

const PK = '0'.repeat(64);
const ADDR = rt.DUMMY_ADDRESS;
const B32 = new rt.CompactTypeBytes(32);
const bytes = (s) => { const b = new Uint8Array(32); new TextEncoder().encode(s).forEach((x, i) => (b[i] = x)); return b; };
const hex = (u) => Buffer.from(u).toString('hex');

// publicTranscript -> plain JSON we can compare.
const plain = (v) => {
  if (v instanceof Uint8Array) return hex(v);
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};

const diffPaths = (a, b, p = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) => diffPaths(a[k], b[k], `${p}/${k}`));
  }
  return [p || '/'];
};

// A fresh contract whose witnesses return whatever `w` holds at call time.
async function deploy(w) {
  const c = new Contract({
    secret_pin: (ctx) => [ctx.privateState, w.pin],
    pin_salt: (ctx) => [ctx.privateState, w.salt],
    vote_choice: (ctx) => [ctx.privateState, w.choice],
  });
  const init = await c.initialState(rt.createConstructorContext({}, PK));
  return { c, state: init.currentContractState.data };
}

async function call(env, circuitId) {
  const ctx = rt.createCircuitContext({ circuitId, contractAddress: ADDR, coinPublicKeyOrZswapState: PK, contractState: env.state, privateState: {} });
  const res = await env.c.circuits[circuitId](ctx);
  env.state = res.context.callContext.currentQueryContext.state;
  return { transcript: plain(res.context.callProofDataTrace.at(-1).publicTranscript), ledger: ledger(env.state) };
}

async function run(circuitId, w) {
  const env = await deploy(w);
  return call(env, circuitId);
}

const SALT_A = bytes('salt-A-fixed-for-the-test');
const SALT_B = bytes('salt-B-fixed-for-the-test');
const report = {};

// 0. Can we read the transcript at all?
const reg1 = await run('register', { pin: bytes('4821'), salt: SALT_A });
report.transcriptOps = reg1.transcript.length;
console.log('0) register() transcript ops:', reg1.transcript.length);

// 1. Determinism.
const reg1b = await run('register', { pin: bytes('4821'), salt: SALT_A });
report.deterministic = JSON.stringify(reg1.transcript) === JSON.stringify(reg1b.transcript);
console.log('1) deterministic:', report.deterministic);

// 2. A1: vary only the hidden PIN (salt fixed) -> what changes on chain?
const reg2 = await run('register', { pin: bytes('9157'), salt: SALT_A });
report.a1Pin = diffPaths(reg1.transcript, reg2.transcript);
console.log('2) A1 vary PIN: transcript differs at', report.a1Pin.length, 'place(s)');

// 3. Salt check: vary only the salt -> pin_commit should change, pin_hash should not.
const reg3 = await run('register', { pin: bytes('4821'), salt: SALT_B });
report.saltChangesCommit = hex(reg1.ledger.pin_commit) !== hex(reg3.ledger.pin_commit);
report.saltChangesHash = hex(reg1.ledger.pin_hash) !== hex(reg3.ledger.pin_hash);
console.log('3) salt changes pin_commit:', report.saltChangesCommit, '| salt changes pin_hash:', report.saltChangesHash);

// 4. A2: recover the PIN from public values by enumerating 0000-9999.
const recover = (target, fn) => {
  for (let i = 0; i < 10000; i++) { const g = String(i).padStart(4, '0'); if (hex(fn(bytes(g))) === target) return g; }
  return null;
};
let t0 = performance.now();
report.a2FromHash = recover(hex(reg1.ledger.pin_hash), (g) => rt.persistentHash(B32, g));
report.a2HashMs = Math.round(performance.now() - t0);
t0 = performance.now();
// Attacker does not know the salt -> tries with an all-zero salt (any guess is as good).
report.a2FromCommit = recover(hex(reg1.ledger.pin_commit), (g) => rt.persistentCommit(B32, g, new Uint8Array(32)));
report.a2CommitMs = Math.round(performance.now() - t0);
console.log(`4) A2 from pin_hash: ${report.a2FromHash} (${report.a2HashMs} ms) | from pin_commit: ${report.a2FromCommit} (${report.a2CommitMs} ms)`);

// 5. A1/A5: vary only the hidden vote choice.
const yes = await run('vote', { choice: true });
const no = await run('vote', { choice: false });
report.a5Vote = diffPaths(yes.transcript, no.transcript);
console.log('5) A1/A5 vary vote choice: transcript differs at', report.a5Vote.length, 'place(s);',
  'yes_votes', yes.ledger.yes_votes, 'vs', no.ledger.yes_votes);

// 6. Timing: one differential pair (2 circuit runs) as the gate would do it.
t0 = performance.now();
for (let i = 0; i < 20; i++) { await run('vote', { choice: true }); await run('vote', { choice: false }); }
report.msPerDifferentialPair = Math.round((performance.now() - t0) / 20);
console.log('6) ms per differential pair:', report.msPerDifferentialPair);

console.log('\nJSON', JSON.stringify(report));
