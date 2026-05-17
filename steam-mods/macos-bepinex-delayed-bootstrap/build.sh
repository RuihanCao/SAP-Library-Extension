#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
clang -dynamiclib -arch x86_64 -arch arm64 \
  "$SCRIPT_DIR/BepInExDelayedBootstrap.c" \
  -o "$SCRIPT_DIR/BepInExDelayedBootstrap.dylib"

file "$SCRIPT_DIR/BepInExDelayedBootstrap.dylib"
