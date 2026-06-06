#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GAME_DIR="${SAP_GAME_DIR:-$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets}"
DOTNET="${DOTNET:-$REPO_ROOT/.tmp/dotnet/sdk/dotnet}"
BEPINEX_CORE_DIR="${BEPINEX_CORE_DIR:-$GAME_DIR/BepInEx/core}"
PATCHER_DIR="$GAME_DIR/BepInEx/patchers"

export DOTNET_CLI_TELEMETRY_OPTOUT=1

"$DOTNET" build "$SCRIPT_DIR/SapBepInExChainloaderKick.csproj" \
  -c Release \
  -p:BEPINEX_CORE_DIR="$BEPINEX_CORE_DIR"

mkdir -p "$PATCHER_DIR"
cp "$SCRIPT_DIR/bin/Release/SapBepInExChainloaderKick.dll" "$PATCHER_DIR/"

echo "Installed $PATCHER_DIR/SapBepInExChainloaderKick.dll"
