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

/** Compact types as the engine needs them: enough to build and vary runtime values. */
export type CType =
	| { kind: "boolean" }
	| { kind: "uint"; max: bigint }
	| { kind: "field" }
	| { kind: "bytes"; length: number }
	| { kind: "enum"; name: string; size: number }
	| { kind: "struct"; name: string; fields: { name: string; type: CType }[] }
	| { kind: "vector"; length: number; element: CType }
	| { kind: "opaque"; name: string }
	/** A reference to another contract; passed as { bytes: Uint8Array(32) }. */
	| { kind: "contract"; name: string };

type InfoType = {
	"type-name": string;
	maxval?: number;
	length?: number;
	name?: string;
	elements?: unknown[];
	type?: InfoType;
};

/** contract-info.json writes maxval as a JSON number, which loses precision above 2^53. */
function maxFromInfo(maxval: number): bigint {
	if (Number.isSafeInteger(maxval)) return BigInt(maxval);
	const bits = Math.round(Math.log2(maxval + 1));
	return (1n << BigInt(bits)) - 1n;
}

/** Parse a type entry from compiler/contract-info.json. */
export function fromInfo(t: InfoType): CType {
	switch (t["type-name"]) {
		case "Boolean":
			return { kind: "boolean" };
		case "Uint":
			return { kind: "uint", max: maxFromInfo(t.maxval ?? 0) };
		case "Field":
			return { kind: "field" };
		case "Bytes":
			return { kind: "bytes", length: t.length ?? 0 };
		case "Enum":
			return { kind: "enum", name: t.name ?? "", size: (t.elements ?? []).length };
		case "Struct":
			return {
				kind: "struct",
				name: t.name ?? "",
				fields: ((t.elements ?? []) as { name: string; type: InfoType }[]).map((e) => ({
					name: e.name,
					type: fromInfo(e.type),
				})),
			};
		case "Vector":
			return { kind: "vector", length: t.length ?? 0, element: fromInfo(t.type as InfoType) };
		case "Contract":
			return { kind: "contract", name: t.name ?? "" };
		default:
			return { kind: "opaque", name: t["type-name"] };
	}
}

/**
 * Parse a type as the runtime prints it in type errors, e.g.
 * `Uint<0..256>`, `Bytes<32>`, `struct Info<age: Uint<0..256>, tag: Bytes<4>>`,
 * `Enum<Color, red, green>`, `Vector<3, Field>`. Used for constructor arguments,
 * which contract-info.json does not describe.
 */
export function fromRuntimeString(s: string): CType {
	const p = new Parser(s);
	const t = p.type();
	return t;
}

class Parser {
	private i = 0;
	constructor(private readonly s: string) {}

	private ws(): void {
		while (this.s[this.i] === " ") this.i++;
	}
	private ident(): string {
		this.ws();
		const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(this.s.slice(this.i));
		if (!m) throw new Error(`cannot parse type at ${this.i}: ${this.s}`);
		this.i += m[0].length;
		return m[0];
	}
	private eat(c: string): void {
		this.ws();
		if (this.s[this.i] !== c) throw new Error(`expected '${c}' at ${this.i}: ${this.s}`);
		this.i++;
	}
	private peek(): string {
		this.ws();
		return this.s[this.i] ?? "";
	}
	private number(): bigint {
		this.ws();
		const m = /^\d+/.exec(this.s.slice(this.i));
		if (!m) throw new Error(`expected number at ${this.i}: ${this.s}`);
		this.i += m[0].length;
		return BigInt(m[0]);
	}

	type(): CType {
		const head = this.ident();
		switch (head) {
			case "Boolean":
				return { kind: "boolean" };
			case "Field":
				return { kind: "field" };
			case "Uint": {
				this.eat("<");
				const a = this.number();
				let max: bigint;
				if (this.peek() === ".") {
					this.eat(".");
					this.eat(".");
					max = this.number() - 1n;
				} else {
					max = (1n << a) - 1n;
				}
				this.eat(">");
				return { kind: "uint", max };
			}
			case "Bytes": {
				this.eat("<");
				const n = Number(this.number());
				this.eat(">");
				return { kind: "bytes", length: n };
			}
			case "Vector": {
				this.eat("<");
				const n = Number(this.number());
				this.eat(",");
				const element = this.type();
				this.eat(">");
				return { kind: "vector", length: n, element };
			}
			case "Enum": {
				this.eat("<");
				const name = this.ident();
				let size = 0;
				while (this.peek() === ",") {
					this.eat(",");
					this.ident();
					size++;
				}
				this.eat(">");
				return { kind: "enum", name, size };
			}
			case "contract": {
				const name = this.ident();
				// Skip the circuit list: contract Name[f(T): R, ...]
				if (this.peek() === "[") {
					let depth = 0;
					do {
						const ch = this.s[this.i++];
						if (ch === "[") depth++;
						if (ch === "]") depth--;
					} while (depth > 0 && this.i < this.s.length);
				}
				return { kind: "contract", name };
			}
			case "struct": {
				const name = this.ident();
				this.eat("<");
				const fields: { name: string; type: CType }[] = [];
				while (this.peek() !== ">") {
					const fname = this.ident();
					this.eat(":");
					fields.push({ name: fname, type: this.type() });
					if (this.peek() === ",") this.eat(",");
				}
				this.eat(">");
				return { kind: "struct", name, fields };
			}
			default: {
				// Opaque<"string"> and anything unknown: skip to the matching '>'.
				if (this.peek() === "<") {
					let depth = 0;
					do {
						const c = this.s[this.i++];
						if (c === "<") depth++;
						if (c === ">") depth--;
					} while (depth > 0 && this.i < this.s.length);
				}
				return { kind: "opaque", name: head };
			}
		}
	}
}

export function typeToString(t: CType): string {
	switch (t.kind) {
		case "boolean":
			return "Boolean";
		case "uint":
			return `Uint<0..${t.max + 1n}>`;
		case "field":
			return "Field";
		case "bytes":
			return `Bytes<${t.length}>`;
		case "enum":
			return `Enum<${t.name}>`;
		case "struct":
			return t.name;
		case "vector":
			return `Vector<${t.length}, ${typeToString(t.element)}>`;
		case "opaque":
			return t.name;
		case "contract":
			return `contract ${t.name}`;
	}
}
