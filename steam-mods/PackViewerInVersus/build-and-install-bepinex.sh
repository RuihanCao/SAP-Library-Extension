#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GAME_DIR="${SAP_GAME_DIR:-$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets}"
DOTNET="${DOTNET:-$REPO_ROOT/.tmp/dotnet/sdk/dotnet}"
BEPINEX_CORE_DIR="${BEPINEX_CORE_DIR:-$GAME_DIR/BepInEx/core}"
UNITY_REFS_DIR="${UNITY_REFS_DIR:-$GAME_DIR/BepInEx/interop}"
PLUGIN_DIR="$GAME_DIR/BepInEx/plugins"

export DOTNET_CLI_TELEMETRY_OPTOUT=1

"$DOTNET" build "$SCRIPT_DIR/PackViewerInVersus.csproj" \
  -c Release \
  -p:BEPINEX_CORE_DIR="$BEPINEX_CORE_DIR" \
  -p:UNITY_REFS_DIR="$UNITY_REFS_DIR"

mkdir -p "$PLUGIN_DIR"
rm -f "$PLUGIN_DIR/PackViewerInVersus.BepInExSmoke.dll"
cp "$SCRIPT_DIR/bin/Release/net6.0/PackViewerInVersus.dll" "$PLUGIN_DIR/"

echo "Installed $PLUGIN_DIR/PackViewerInVersus.dll"
