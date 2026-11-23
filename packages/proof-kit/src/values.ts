// This file is part of krnightforce.
// Copyright (C) krnightforce contributors
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//	https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { CType } from "./types.js";

/** A runtime value as compiled contracts expect it (bigint, Uint8Array, boolean, number, object, array). */
export type Value = unknown;

/** Leaf types: the scalar parts of a hidden input that the engine varies one at a time. */
export type LeafType = Exclude<CType, { kind: "struct" } | { kind: "vector" }>;

export interface Leaf {
	/** Path inside the value, e.g. ["age"] or ["2"] for a vector element. Empty for scalars. */
	path: string[];
	type: LeafType;
}

/**
 * How much an attacker can guess about a leaf.
 * - enumerable: the whole domain is small enough to try every value (Boolean, Enum, small Uint).
 * - guessable: a large domain whose realistic values are small or common (amounts, PINs, ages).
 * - secret: high entropy (keys, salts, nonces). The attacker cannot guess it.
 * - untestable: the engine cannot build values for it.
 */
export type Entropy = "enumerable" | "guessable" | "secret" | "untestable";

/** Domains up to this size are enumerated in full. */
export const ENUM_LIMIT = 4096n;

/**
 * Name tokens that suggest a low-entropy value even when the type is Bytes<32> or Field.
 * This only picks the attacker's assumed value range; verdicts still come from execution.
 */
const LOW_ENTROPY_TERMS = [
	"pin",
	"passcode",
	"password",
	"age",
	"birth",
	"birthdate",
	"birthday",
	"dob",
	"year",
	"amount",
	"balance",
	"salary",
	"income",
	"score",
	"vote",
	"choice",
	"option",
	"answer",
	"bid",
	"price",
	"grade",
	"rating",
	"zip",
	"postal",
	"phone",
];
/** Name tokens that mark a deliberate mask or key. These win over low-entropy terms. */
const SECRET_TERMS = [
	"salt",
	"nonce",
	"rand",
	"random",
	"randomness",
	"blind",
	"blinding",
	"opening",
	"sk",
	"key",
	"seed",
	"entropy",
];

/** Split `localSecretKey`, `pin_salt`, `w.age` into lower-case tokens. */
export function nameTokens(label: string): string[] {
	return label
		.split(/[^A-Za-z0-9]+|(?<=[a-z0-9])(?=[A-Z])/)
		.filter((t) => t.length > 0)
		.map((t) => t.toLowerCase());
}

function hasTerm(label: string, terms: string[]): boolean {
	return nameTokens(label).some((t) => terms.includes(t));
}

export function leaves(t: CType, path: string[] = []): Leaf[] {
	switch (t.kind) {
		case "struct":
			return t.fields.flatMap((f) => leaves(f.type, [...path, f.name]));
		case "vector":
			return Array.from({ length: t.length }, (_, i) =>
				leaves(t.element, [...path, String(i)]),
			).flat();
		default:
			return [{ path, type: t }];
	}
}

export function entropyOf(leaf: Leaf, name: string): Entropy {
	const t = leaf.type;
	const label = [name, ...leaf.path].join(".");
	switch (t.kind) {
		case "boolean":
		case "enum":
			return "enumerable";
		case "uint":
			return t.max + 1n <= ENUM_LIMIT ? "enumerable" : "guessable";
		case "field":
		case "bytes":
			if (hasTerm(label, SECRET_TERMS)) return "secret";
			if (hasTerm(label, LOW_ENTROPY_TERMS)) return "guessable";
			if (t.kind === "bytes" && t.length < 8) return "guessable";
			return "secret";
		case "opaque":
		case "contract":
			return "untestable";
	}
}

/** Small deterministic PRNG (mulberry32) so three runs give identical results. */
export function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomBytes(n: number, rnd: () => number): Uint8Array {
	const b = new Uint8Array(n);
	for (let i = 0; i < n; i++) b[i] = Math.floor(rnd() * 256);
	return b;
}

function asciiBytes(s: string, n: number): Uint8Array {
	const b = new Uint8Array(n);
	const e = new TextEncoder().encode(s);
	b.set(e.slice(0, n));
	return b;
}

function leBytes(v: bigint, n: number): Uint8Array {
	const b = new Uint8Array(n);
	let x = v;
	for (let i = 0; i < n && x > 0n; i++) {
		b[i] = Number(x & 0xffn);
		x >>= 8n;
	}
	return b;
}

/** Default value for a full type (used for inputs not under attack). */
export function defaultValue(t: CType, name: string, rnd: () => number): Value {
	switch (t.kind) {
		case "struct":
			return Object.fromEntries(
				t.fields.map((f) => [f.name, defaultValue(f.type, `${name}.${f.name}`, rnd)]),
			);
		case "vector":
			return Array.from({ length: t.length }, (_, i) =>
				defaultValue(t.element, `${name}.${i}`, rnd),
			);
		default:
			return baseLeafValue({ path: [], type: t }, name, rnd);
	}
}

/**
 * Base value of a leaf. Guessable leaves get a realistic small value so that a
 * recovery attack, if it works, shows it on a value a real user could have.
 */
export function baseLeafValue(leaf: Leaf, name: string, _rnd?: () => number): Value {
	const t = leaf.type;
	const e = entropyOf(leaf, name);
	switch (t.kind) {
		case "boolean":
			return true;
		case "enum":
			return Math.min(1, Math.max(0, t.size - 1));
		case "uint":
			return t.max < 37n ? t.max : 37n;
		// High-entropy base values are the same for every input of the same type, so an ID
		// registered by one circuit matches the ID another circuit looks up.
		case "field":
			return e === "secret" ? 2n ** 50n + 12345n : 37n;
		case "bytes":
			return e === "secret"
				? randomBytes(t.length, prng(1000 + t.length))
				: asciiBytes("4821", t.length);
		case "opaque":
			return "";
		case "contract":
			// A fixed dummy address: calls into it cannot run here, but other circuits can.
			return { bytes: new Uint8Array(32).fill(0x11) };
	}
}

/** Values to try for a leaf in the differential (A1) attack. Always includes the base value first. */
export function samples(
	leaf: Leaf,
	name: string,
	base: Value,
	constants: bigint[],
	rnd: () => number,
): Value[] {
	const t = leaf.type;
	const out: Value[] = [base];
	const push = (v: Value) => {
		if (!out.some((o) => same(o, v))) out.push(v);
	};
	switch (t.kind) {
		case "boolean":
			push(!(base as boolean));
			break;
		case "enum":
			for (let i = 0; i < Math.min(t.size, 16); i++) push(i);
			break;
		case "uint": {
			const cand = [0n, 1n, 2n, 3n, t.max, t.max - 1n, t.max / 2n];
			for (const c of constants) cand.push(c - 1n, c, c + 1n);
			for (let i = 0; i < 4; i++)
				cand.push(BigInt(Math.floor(rnd() * Number(t.max < 2n ** 48n ? t.max : 2n ** 48n))));
			for (const c of cand) if (c >= 0n && c <= t.max) push(c);
			break;
		}
		case "field": {
			const cand = [0n, 1n, 2n, 3n, 1000n];
			for (const c of constants) cand.push(c - 1n, c, c + 1n);
			for (let i = 0; i < 4; i++) cand.push(BigInt(Math.floor(rnd() * 2 ** 48)) + 2n ** 50n);
			for (const c of cand) if (c >= 0n) push(c);
			break;
		}
		case "bytes": {
			push(new Uint8Array(t.length));
			push(new Uint8Array(t.length).fill(0xff));
			for (let i = 0; i < 5; i++) push(randomBytes(t.length, rnd));
			if (entropyOf(leaf, name) === "guessable") {
				for (const s of ["0000", "1234", "9157", "1"]) push(asciiBytes(s, t.length));
			}
			break;
		}
		case "opaque":
		case "contract":
			break;
	}
	return out.slice(0, 24);
}

/** An alternative value for a secret leaf, used to check whether it masks a difference. */
export function altSecret(leaf: Leaf, base: Value, rnd: () => number): Value {
	const t = leaf.type;
	if (t.kind === "bytes") {
		let v = randomBytes(t.length, rnd);
		while (same(v, base)) v = randomBytes(t.length, rnd);
		return v;
	}
	if (t.kind === "field") return (base as bigint) + 1n + BigInt(Math.floor(rnd() * 1000));
	return base;
}

/**
 * Candidates for the recovery (A2) attack, most likely first. Enumerable leaves
 * give their whole domain; guessable ones a dictionary bounded by `budget`.
 */
export function* candidates(leaf: Leaf, name: string, budget: number): Generator<Value> {
	const t = leaf.type;
	const e = entropyOf(leaf, name);
	if (e === "secret" || e === "untestable") return;
	switch (t.kind) {
		case "boolean":
			yield false;
			yield true;
			return;
		case "enum":
			for (let i = 0; i < t.size; i++) yield i;
			return;
		case "uint":
		case "field": {
			const limit = t.kind === "uint" && t.max < BigInt(budget) ? t.max : BigInt(budget - 1);
			for (let v = 0n; v <= limit; v++) yield v;
			return;
		}
		case "bytes": {
			// ASCII decimal strings (PIN-like) first, then little-endian integers.
			let n = 0;
			const half = Math.floor(budget / 2);
			for (const width of [4, 6]) {
				const max = 10 ** width;
				for (let i = 0; i < max && n < half; i++, n++)
					yield asciiBytes(String(i).padStart(width, "0"), t.length);
			}
			for (let i = 0; i < 1000 && n < half; i++, n++) yield asciiBytes(String(i), t.length);
			for (let i = 0n; n < budget; i++, n++) yield leBytes(i, t.length);
			return;
		}
	}
}

export function getLeaf(v: Value, path: string[]): Value {
	let x = v as Record<string, unknown>;
	for (const p of path) x = (x as Record<string, unknown>)[p] as Record<string, unknown>;
	return x;
}

export function setLeaf(v: Value, path: string[], leafValue: Value): Value {
	if (path.length === 0) return leafValue;
	const [head, ...rest] = path;
	if (Array.isArray(v)) {
		const copy = [...v];
		copy[Number(head)] = setLeaf(copy[Number(head)], rest, leafValue);
		return copy;
	}
	const obj = v as Record<string, unknown>;
	return { ...obj, [head]: setLeaf(obj[head], rest, leafValue) };
}

export function same(a: Value, b: Value): boolean {
	return show(a) === show(b);
}

/** Human-readable, stable rendering of a value for reports. */
export function show(v: Value): string {
	if (v instanceof Uint8Array) {
		const text = new TextDecoder("utf-8", { fatal: false }).decode(v).replace(/\0+$/, "");
		const printable = text.length > 0 && /^[\x20-\x7e]+$/.test(text);
		return printable ? `"${text}"` : `0x${Buffer.from(v).toString("hex")}`;
	}
	if (typeof v === "bigint") return v.toString();
	if (Array.isArray(v)) return `[${v.map(show).join(",")}]`;
	if (v && typeof v === "object")
		return `{${Object.entries(v)
			.map(([k, x]) => `${k}:${show(x)}`)
			.join(",")}}`;
	return String(v);
}

/** How a leaf value appears inside a public transcript, for the "copied verbatim" check. */
export function transcriptEncoding(leaf: Leaf, v: Value): string | null {
	const t = leaf.type;
	if (t.kind === "bytes") return Buffer.from(v as Uint8Array).toString("hex");
	if (t.kind === "uint" || t.kind === "field") {
		let x = v as bigint;
		if (x === 0n) return null;
		let hex = "";
		while (x > 0n) {
			hex += (x & 0xffn).toString(16).padStart(2, "0");
			x >>= 8n;
		}
		return hex;
	}
	return null;
}
