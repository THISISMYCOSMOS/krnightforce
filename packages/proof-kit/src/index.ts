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

export { attack, criteriaFor, FAILURE_KINDS, VERSION, verifierChecks } from "./attack.js";
export type {
	AttackOptions,
	Finding,
	InputReport,
	Kind,
	Report,
	UnitReport,
	VerifierCheck,
	Where,
} from "./attack.js";
export {
	checkAgainstAnswer,
	corpusMarkdown,
	findCompiled,
	runCorpus,
	runScenarios,
	scenarioMarkdown,
} from "./bench.js";
export type {
	Answer,
	AnswerContract,
	ContractCheck,
	CorpusBench,
	CorpusRow,
	ScenarioBench,
} from "./bench.js";
export { loadCompiled, Runner } from "./harness.js";
export type { Compiled } from "./harness.js";
export { formatText } from "./format.js";
export {
	CLASS_LABEL,
	classify,
	inputClasses,
	mapRows,
	renderMapMarkdown,
	renderMermaid,
} from "./map.js";
export type { MapClass, MapRow } from "./map.js";
export { covers, findSpec, loadSpec } from "./spec.js";
export type { LoadedSpec, PrivacySpec } from "./spec.js";
