#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GAME_DIR="${SAP_GAME_DIR:-$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets}"
DOTNET="${DOTNET:-$REPO_ROOT/.tmp/dotnet/sdk/dotnet}"
MELONLOADER_DIR="${MELONLOADER_DIR:-$GAME_DIR/MelonLoader}"
UNITY_REFS_DIR="${UNITY_REFS_DIR:-$GAME_DIR/BepInEx/interop}"
MODS_DIR="${SAP_MODS_DIR:-$GAME_DIR/Mods}"

export DOTNET_CLI_TELEMETRY_OPTOUT=1

"$DOTNET" build "$SCRIPT_DIR/PackViewerInVersus.MelonLoader.csproj" \
  -c Release \
  -p:MELONLOADER_DIR="$MELONLOADER_DIR" \
  -p:UNITY_REFS_DIR="$UNITY_REFS_DIR"

mkdir -p "$MODS_DIR"
cp "$SCRIPT_DIR/bin/Release/net6.0/PackViewerInVersus.dll" "$MODS_DIR/"

echo "Installed $MODS_DIR/PackViewerInVersus.dll"
