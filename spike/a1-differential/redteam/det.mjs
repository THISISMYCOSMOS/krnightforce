import * as rt from '@midnight-ntwrk/compact-runtime';
import { Contract } from '../managed/vault/contract/index.js';
import { createHash } from 'node:crypto';
const PK = '0'.repeat(64);
const b = (s) => { const u = new Uint8Array(32); new TextEncoder().encode(s).forEach((x, i) => (u[i] = x)); return u; };
const plain = (v) => v instanceof Uint8Array ? Buffer.from(v).toString('hex') : typeof v === 'bigint' ? v.toString()
  : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v;
const c = new Contract({ secret_pin: (x) => [x.privateState, b('4821')], pin_salt: (x) => [x.privateState, b('s')], vote_choice: (x) => [x.privateState, true] });
const init = await c.initialState(rt.createConstructorContext({}, PK));
let h = createHash('sha256');
for (const id of ['register', 'vote']) {
  const r = await c.circuits[id](rt.createCircuitContext({ circuitId: id, contractAddress: rt.DUMMY_ADDRESS, coinPublicKeyOrZswapState: PK, contractState: init.currentContractState.data, privateState: {} }));
  h.update(JSON.stringify(plain(r.context.callProofDataTrace.at(-1).publicTranscript)));
}
console.log(h.digest('hex'));
