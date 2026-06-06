#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GAME_DIR="${SAP_GAME_DIR:-$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets}"
DOTNET="${DOTNET:-$REPO_ROOT/.tmp/dotnet/sdk/dotnet}"
BEPINEX_CORE_DIR="${BEPINEX_CORE_DIR:-$GAME_DIR/BepInEx/core}"
RUNTIME_DLL="$BEPINEX_CORE_DIR/Il2CppInterop.Runtime.dll"
MODULE_NAME="${SAP_MACOS_PROCESS_MODULE_NAME:-Super Auto Pets}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$GAME_DIR/BepInEx/backups/il2cppinterop-runtime-macos-patch-$STAMP"

if [ ! -f "$RUNTIME_DLL" ]; then
  echo "Il2CppInterop.Runtime.dll not found: $RUNTIME_DLL" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
cp "$RUNTIME_DLL" "$BACKUP_DIR/Il2CppInterop.Runtime.dll"

export DOTNET_CLI_TELEMETRY_OPTOUT=1

"$DOTNET" run \
  --project "$SCRIPT_DIR/tools/Il2CppInteropMacPatch/Il2CppInteropMacPatch.csproj" \
  -p:BEPINEX_CORE_DIR="$BEPINEX_CORE_DIR" \
  -- "$RUNTIME_DLL" "$MODULE_NAME"

echo "Backed up original runtime to $BACKUP_DIR/Il2CppInterop.Runtime.dll"
