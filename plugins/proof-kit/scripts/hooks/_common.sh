#!/usr/bin/env bash
# This file is part of krnightforce.
# Copyright (C) 2026 krnightforce contributors
# SPDX-License-Identifier: Apache-2.0
# Licensed under the Apache License, Version 2.0 (the "License");
# You may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#	https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Sourced helper for proof-kit hooks.
#   pk_windows_notice   prints a WSL notice and returns 0 on native Windows shells.
#   pk_engine_available returns 0 when the proof-kit engine CLI is resolvable
#                       from the project (npx --no-install proof-kit).

pk_windows_notice() {
	case "$(uname -s 2>/dev/null)" in
	MINGW* | MSYS* | CYGWIN*)
		echo "proof-kit: native Windows is not supported; run Claude Code inside WSL." >&2
		return 0
		;;
	esac
	return 1
}

pk_engine_available() {
	local root="$1"
	[ -n "$root" ] || return 1
	command -v node >/dev/null 2>&1 || return 1
	[ -e "$root/node_modules/.bin/proof-kit" ]
}
