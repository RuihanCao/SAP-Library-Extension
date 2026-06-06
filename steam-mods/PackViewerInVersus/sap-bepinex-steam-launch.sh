#!/bin/bash
#
# Steam launch wrapper for SAP + BepInEx IL2CPP on macOS.
#
# Steam launch options:
#   "/Users/YOUR_USER/Library/Application Support/Steam/steamapps/common/Super Auto Pets/sap-bepinex-steam-launch.sh" %command%
#
# This keeps Steam in charge of the launch while bypassing LaunchServices so
# DYLD_INSERT_LIBRARIES reaches the actual Unity binary.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$SCRIPT_DIR/Super Auto Pets.app"
BINARY_NAME="$(/usr/libexec/PlistBuddy -c "Print CFBundleExecutable" "$APP/Contents/Info.plist")"
BINARY="$APP/Contents/MacOS/$BINARY_NAME"

ENV_FILE="${SAP_BEPINEX_ENV_FILE:-$SCRIPT_DIR/.sap-bepinex-env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

DOORSTOP="$SCRIPT_DIR/libdoorstop.dylib"
DELAYED_BOOTSTRAP="${SAP_BEPINEX_DELAYED_BOOTSTRAP:-$SCRIPT_DIR/BepInExDelayedBootstrap.dylib}"
CORECLR="$SCRIPT_DIR/dotnet/libcoreclr.dylib"
TARGET_ASSEMBLY="$SCRIPT_DIR/BepInEx/core/BepInEx.Unity.IL2CPP.dll"

if [[ ! -x "$BINARY" || ! -f "$DOORSTOP" || ! -f "$DELAYED_BOOTSTRAP" || ! -f "$CORECLR" || ! -f "$TARGET_ASSEMBLY" ]]; then
  echo "sap-bepinex-steam-launch: missing required BepInEx file; launching original command" >&2
  exec "$@"
fi

if [[ -d "${1:-}" && "${1%.app}" != "$1" ]]; then
  first_arg_abs="$(cd "$1" && pwd)"
  app_abs="$(cd "$APP" && pwd)"
  if [[ "$first_arg_abs" == "$app_abs" ]]; then
    shift
    set -- "$BINARY" "$@"
  fi
fi

export ARCHPREFERENCE="x86_64,arm64"
export DOORSTOP_ENABLED=1
export DOORSTOP_TARGET_ASSEMBLY="$TARGET_ASSEMBLY"
export DOORSTOP_CLR_RUNTIME_CORECLR_PATH="$CORECLR"
export DOORSTOP_CLR_CORLIB_DIR="$SCRIPT_DIR/dotnet"
export DOORSTOP_IGNORE_DISABLED_ENV=0
export DOORSTOP_MONO_DEBUG_ENABLED=0
export DOORSTOP_MONO_DEBUG_SUSPEND=0
export DOORSTOP_MONO_DEBUG_ADDRESS=127.0.0.1:10000

export DYLD_LIBRARY_PATH="$SCRIPT_DIR:$SCRIPT_DIR/dotnet${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"

insert_libs="$DOORSTOP:$DELAYED_BOOTSTRAP"
if [[ -n "${STEAM_DYLD_INSERT_LIBRARIES:-}" ]]; then
  insert_libs="$insert_libs:$STEAM_DYLD_INSERT_LIBRARIES"
fi
if [[ -n "${DYLD_INSERT_LIBRARIES:-}" ]]; then
  insert_libs="$insert_libs:$DYLD_INSERT_LIBRARIES"
fi
export DYLD_INSERT_LIBRARIES="$insert_libs"

if [[ "${1:-}" == "$BINARY" ]]; then
  shift
fi

exec /usr/bin/arch -x86_64 \
  -e DYLD_INSERT_LIBRARIES="$DYLD_INSERT_LIBRARIES" \
  -e DYLD_LIBRARY_PATH="$DYLD_LIBRARY_PATH" \
  "$BINARY" "$@"
