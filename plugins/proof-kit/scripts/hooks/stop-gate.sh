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
set -euo pipefail

# Stop hook: gate on NEW privacy failures compared with privacy-baseline.json,
# with a cooldown so it never loops (same approach as compact-core's Stop hook).
# Stub: no blocking behavior yet; exits 0 when the engine is not installed.

# shellcheck source=SCRIPTDIR/_common.sh
source "$(dirname "$0")/_common.sh"

INPUT=$(cat)
if pk_windows_notice; then
	exit 0
fi
command -v jq >/dev/null 2>&1 || exit 0

STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"

# Never block a reattempt.
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
	exit 0
fi
if ! pk_engine_available "$PROJECT_ROOT"; then
	exit 0
fi

# TODO(engine): if .compact files changed this session and the cooldown is clear,
# run the engine against privacy-baseline.json; on NEW failures emit
#   {"decision":"block","reason":"..."} and exit 2. Otherwise exit 0.
exit 0
