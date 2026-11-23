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

import { describe, expect, it } from "vitest";
import { fromRuntimeString } from "../src/types.js";
import { entropyOf, nameTokens } from "../src/values.js";

describe("name hints", () => {
	const bytes32 = { path: [], type: { kind: "bytes" as const, length: 32 } };
	it("splits names into tokens", () => {
		expect(nameTokens("localSecretKey")).toEqual(["local", "secret", "key"]);
		expect(nameTokens("pin_salt")).toEqual(["pin", "salt"]);
	});
	it("treats salts and keys as secret even next to a low-entropy word", () => {
		expect(entropyOf(bytes32, "pin_salt")).toBe("secret");
		expect(entropyOf(bytes32, "localSecretKey")).toBe("secret");
	});
	it("treats PIN-like names as guessable", () => {
		expect(entropyOf(bytes32, "secret_pin")).toBe("guessable");
		expect(entropyOf(bytes32, "birthDate")).toBe("guessable");
	});
	it("does not match words that only contain a term", () => {
		expect(entropyOf(bytes32, "message")).toBe("secret");
		expect(entropyOf(bytes32, "storage")).toBe("secret");
	});
});

describe("runtime type strings", () => {
	it("parses the forms the runtime prints", () => {
		expect(fromRuntimeString("Uint<0..256>")).toEqual({ kind: "uint", max: 255n });
		expect(fromRuntimeString("Bytes<32>")).toEqual({ kind: "bytes", length: 32 });
		expect(fromRuntimeString("struct Info<age: Uint<0..256>, tag: Bytes<4>>")).toEqual({
			kind: "struct",
			name: "Info",
			fields: [
				{ name: "age", type: { kind: "uint", max: 255n } },
				{ name: "tag", type: { kind: "bytes", length: 4 } },
			],
		});
		expect(fromRuntimeString("Enum<Color, red, green, blue>")).toEqual({
			kind: "enum",
			name: "Color",
			size: 3,
		});
		expect(fromRuntimeString("Vector<3, Field>")).toEqual({
			kind: "vector",
			length: 3,
			element: { kind: "field" },
		});
	});
});
