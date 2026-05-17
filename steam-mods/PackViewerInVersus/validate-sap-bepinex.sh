#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="${SAP_GAME_DIR:-$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets}"
APP="$GAME_DIR/Super Auto Pets.app"
RUNNER="$GAME_DIR/run_bepinex.sh"
DOORSTOP="$GAME_DIR/libdoorstop.dylib"
CORECLR="$GAME_DIR/dotnet/libcoreclr.dylib"
TARGET_ASSEMBLY="$GAME_DIR/BepInEx/core/BepInEx.Unity.IL2CPP.dll"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DELAYED_BOOTSTRAP="$REPO_ROOT/steam-mods/macos-bepinex-delayed-bootstrap/BepInExDelayedBootstrap.dylib"
PLUGIN_DIR="$GAME_DIR/BepInEx/plugins"
SMOKE_PLUGIN="$PLUGIN_DIR/PackViewerInVersus.BepInExSmoke.dll"
PACK_VIEWER_PLUGIN="$PLUGIN_DIR/PackViewerInVersus.dll"
PATCHER_DIR="$GAME_DIR/BepInEx/patchers"
CHAINLOADER_KICK="$PATCHER_DIR/SapBepInExChainloaderKick.dll"
DATA_LINK="$GAME_DIR/Data"
GAME_ASSEMBLY_LINK="$GAME_DIR/GameAssembly.dylib"
LOG_A="$GAME_DIR/BepInEx/LogOutput.log"
LOG_B="$GAME_DIR/BepInEx/LogOutput.txt"
RUN_SECONDS="${SAP_BEPINEX_VALIDATE_SECONDS:-20}"
STDOUT_LOG="${SAP_BEPINEX_STDOUT_LOG:-/tmp/sap-bepinex-validation.out}"

failures=0
pid=""

cleanup() {
  if [[ -n "${pid:-}" ]] && ps -p "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 2
  fi
  if [[ -n "${pid:-}" ]] && ps -p "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

check_file() {
  local label="$1"
  local path="$2"

  if [[ -f "$path" ]]; then
    echo "PASS file: $label -> $path"
  else
    echo "FAIL file: $label -> $path"
    failures=$((failures + 1))
  fi
}

check_dir() {
  local label="$1"
  local path="$2"

  if [[ -d "$path" ]]; then
    echo "PASS dir:  $label -> $path"
  else
    echo "FAIL dir:  $label -> $path"
    failures=$((failures + 1))
  fi
}

contains_any() {
  local file="$1"
  shift

  [[ -f "$file" ]] || return 1
  for pattern in "$@"; do
    if rg -q "$pattern" "$file"; then
      return 0
    fi
  done

  return 1
}

log_file() {
  if [[ -f "$LOG_A" ]]; then
    echo "$LOG_A"
  elif [[ -f "$LOG_B" ]]; then
    echo "$LOG_B"
  fi
}

echo "== Static layout checks =="
check_dir "game dir" "$GAME_DIR"
check_dir "app bundle" "$APP"
check_file "BepInEx runner" "$RUNNER"
check_file "Doorstop dylib" "$DOORSTOP"
check_file "CoreCLR dylib" "$CORECLR"
check_file "BepInEx IL2CPP target assembly" "$TARGET_ASSEMBLY"
check_file "delayed bootstrap shim" "$DELAYED_BOOTSTRAP"
check_dir "BepInEx plugins folder" "$PLUGIN_DIR"
if [[ -f "$PACK_VIEWER_PLUGIN" ]]; then
  echo "PASS file: Pack Viewer plugin -> $PACK_VIEWER_PLUGIN"
elif [[ -f "$SMOKE_PLUGIN" ]]; then
  echo "PASS file: BepInEx smoke plugin -> $SMOKE_PLUGIN"
else
  echo "FAIL file: Pack Viewer or smoke plugin -> $PACK_VIEWER_PLUGIN"
  failures=$((failures + 1))
fi
check_dir "BepInEx patchers folder" "$PATCHER_DIR"
check_file "chainloader kick patcher" "$CHAINLOADER_KICK"
check_dir "root Data compatibility link" "$DATA_LINK"
check_file "root GameAssembly compatibility link" "$GAME_ASSEMBLY_LINK"

echo
echo "== Architecture =="
if [[ -f "$DOORSTOP" ]]; then
  file "$DOORSTOP"
fi
if [[ -f "$CORECLR" ]]; then
  file "$CORECLR"
fi
if [[ -f "$APP/Contents/MacOS/Super Auto Pets" ]]; then
  file "$APP/Contents/MacOS/Super Auto Pets"
fi

echo
echo "== Runner checks =="
if [[ -f "$RUNNER" ]]; then
  if rg -q 'ARCHPREFERENCE="x86_64,arm64"' "$RUNNER"; then
    echo "PASS runner: Apple Silicon prefers Rosetta/x86_64 for x64 CoreCLR"
  else
    echo "FAIL runner: Apple Silicon does not prefer x86_64 before arm64"
    failures=$((failures + 1))
  fi
  rg -n 'DOORSTOP_|DYLD_INSERT_LIBRARIES|ARCHPREFERENCE|coreclr_path|target_assembly' "$RUNNER" || true
fi

echo
echo "== Short controlled launch =="
if [[ ! -x "$APP/Contents/MacOS/Super Auto Pets" ]]; then
  echo "FAIL launch: app executable is not executable"
  failures=$((failures + 1))
else
  cd "$GAME_DIR"
  rm -f "$LOG_A" "$LOG_B" "$STDOUT_LOG"
  export ARCHPREFERENCE=x86_64,arm64
  export DYLD_INSERT_LIBRARIES="$DOORSTOP:$DELAYED_BOOTSTRAP"
  export DYLD_LIBRARY_PATH="$GAME_DIR:$GAME_DIR/dotnet"
  export DOORSTOP_ENABLED=1
  export DOORSTOP_TARGET_ASSEMBLY="$TARGET_ASSEMBLY"
  export DOORSTOP_CLR_RUNTIME_CORECLR_PATH="$CORECLR"
  export DOORSTOP_CLR_CORLIB_DIR="$GAME_DIR/dotnet"
  export DOORSTOP_IGNORE_DISABLED_ENV=0
  export DOORSTOP_MONO_DEBUG_ENABLED=0
  export DOORSTOP_MONO_DEBUG_SUSPEND=0
  export DOORSTOP_MONO_DEBUG_ADDRESS=127.0.0.1:10000
  arch -e DYLD_INSERT_LIBRARIES="$DYLD_INSERT_LIBRARIES" "$APP/Contents/MacOS/Super Auto Pets" > "$STDOUT_LOG" 2>&1 &
  pid=$!
  unset DYLD_INSERT_LIBRARIES DYLD_LIBRARY_PATH
  echo "launched pid=$pid; waiting ${RUN_SECONDS}s"
  sleep "$RUN_SECONDS"

  echo
  echo "== Process libraries =="
  if ps -p "$pid" >/dev/null 2>&1; then
    lsof -p "$pid" 2>/dev/null | rg -i "libdoorstop|coreclr|bepinex|dotnet|unityplayer|gameassembly|rosetta|oah" || true
  else
    echo "process exited before inspection"
  fi

  cleanup
fi

latest_log="$(log_file || true)"

echo
echo "== BepInEx log =="
echo "${latest_log:-<none>}"
if [[ -n "${latest_log:-}" ]]; then
  tail -220 "$latest_log"
fi

echo
echo "== Runner stdout/stderr =="
if [[ -f "$STDOUT_LOG" ]]; then
  rg -n "BepInEx|coreclr|Doorstop|libdoorstop|dyld_chained|hook|jit|error|fail|exception|mh=|slide=" "$STDOUT_LOG" | sed -n '1,260p' || true
fi

echo
echo "== Validation verdict =="
if [[ -f "$STDOUT_LOG" ]] && contains_any "$STDOUT_LOG" "hook|jit|dyld_chained_fixups_header|Doorstop"; then
  echo "PASS doorstop stdout: native Doorstop emitted loader diagnostics"
else
  echo "WARN doorstop stdout: no native loader diagnostics found"
fi

if [[ -f "$STDOUT_LOG" ]] && contains_any "$STDOUT_LOG" "libdoorstop"; then
  echo "PASS doorstop stdout: libdoorstop appeared in native loader output"
else
  echo "WARN doorstop stdout: libdoorstop did not appear in stdout/stderr"
fi

if [[ -f "$STDOUT_LOG" ]] && contains_any "$STDOUT_LOG" "coreclr|BepInEx|Preloader|Chainloader"; then
  echo "PASS managed stdout: CoreCLR/BepInEx markers appeared"
else
  echo "WARN managed stdout: no CoreCLR/BepInEx markers appeared; checking managed log instead"
fi

if [[ -n "${latest_log:-}" ]] && contains_any "$latest_log" "BepInEx|Preloader|Chainloader|Loading \\["; then
  echo "PASS managed log: BepInEx created a managed log"
else
  echo "FAIL managed log: BepInEx did not create a managed log"
  failures=$((failures + 1))
fi

if [[ -n "${latest_log:-}" ]] && contains_any "$latest_log" "SAP BepInEx Chainloader Kick|Forcing IL2CPP chainloader Execute"; then
  echo "PASS patcher: chainloader kick patcher ran"
else
  echo "FAIL patcher: chainloader kick patcher did not run"
  failures=$((failures + 1))
fi

if [[ -n "${latest_log:-}" ]] && contains_any "$latest_log" "Error loading \\[|Fatal|Exception"; then
  echo "FAIL plugin: managed plugin error appeared in BepInEx log"
  failures=$((failures + 1))
elif [[ -n "${latest_log:-}" ]] && contains_any "$latest_log" "PackViewerInVersus|Pack Viewer In Versus|BepInEx smoke plugin loaded|Passive scan found"; then
  echo "PASS plugin: PackViewerInVersus loaded"
else
  echo "FAIL plugin: PackViewerInVersus did not load"
  failures=$((failures + 1))
fi

echo
if (( failures == 0 )); then
  echo "BepInEx is fully validated for SAP."
else
  echo "BepInEx is NOT fully validated for SAP. Failure count: $failures"
  exit 1
fi
