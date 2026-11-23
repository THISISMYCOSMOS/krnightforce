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

# PostToolUse hook (Write|Edit): after a .compact file changes, print a 3-line
# privacy summary from the engine. Stub: never blocks, exits 0 when the engine
# is not installed.

# shellcheck source=SCRIPTDIR/_common.sh
source "$(dirname "$0")/_common.sh"

INPUT=$(cat)
if pk_windows_notice; then
	exit 0
fi
command -v jq >/dev/null 2>&1 || exit 0

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-$CWD}"

case "$FILE_PATH" in
*.compact) ;;
*) exit 0 ;;
esac

if ! pk_engine_available "$PROJECT_ROOT"; then
	exit 0
fi

# TODO(engine): compile the changed contract and run
#   npx --no-install proof-kit attack <compiled-dir> --source "$FILE_PATH" --json --summary
# then print at most 3 lines (failures / untestable / passes) from the JSON.
exit 0
