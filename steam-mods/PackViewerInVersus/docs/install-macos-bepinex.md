# macOS Install: BepInEx 6 IL2CPP

These notes are for Steam Super Auto Pets on macOS.

## Requirements

- Steam Super Auto Pets installed.
- BepInEx 6 IL2CPP macOS x64 build.
- Apple Silicon Macs must run SAP under Rosetta for the current tested BepInEx x64 path.
- A built `PackViewerInVersus.dll`.

## Install BepInEx

Download a BepInEx 6 Unity IL2CPP macOS x64 build from:

<https://builds.bepinex.dev/projects/bepinex_be>

Extract it into the SAP game root, the folder containing `Super Auto Pets.app`.

Typical Steam path:

```sh
~/Library/Application Support/Steam/steamapps/common/Super Auto Pets
```

The game root should contain files/folders like:

```text
BepInEx/
dotnet/
libdoorstop.dylib
run_bepinex.sh
Super Auto Pets.app
```

## SAP macOS Compatibility Setup

SAP's macOS app layout needs a few compatibility pieces for this tested setup.

From this repo root:

```sh
GAME_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets"

ln -sfn "Super Auto Pets.app/Contents/Resources/Data" "$GAME_DIR/Data"
ln -sfn "Super Auto Pets.app/Contents/Frameworks/GameAssembly.dylib" "$GAME_DIR/GameAssembly.dylib"

./steam-mods/macos-bepinex-delayed-bootstrap/build.sh
cp ./steam-mods/macos-bepinex-delayed-bootstrap/BepInExDelayedBootstrap.dylib "$GAME_DIR/"

SAP_GAME_DIR="$GAME_DIR" ./steam-mods/SapBepInExChainloaderKick/build-and-install.sh
SAP_GAME_DIR="$GAME_DIR" ./steam-mods/PackViewerInVersus/patch-il2cppinterop-runtime-macos.sh
```

Copy the Steam wrapper into the game root:

```sh
cp ./steam-mods/PackViewerInVersus/sap-bepinex-steam-launch.sh "$GAME_DIR/"
chmod +x "$GAME_DIR/sap-bepinex-steam-launch.sh"
```

Create the local env file:

```sh
cat > "$GAME_DIR/.sap-bepinex-env" <<'EOF'
SAP_CHAINLOADER_KICK_DELAY_MS=0
EOF
```

In `BepInEx/config/BepInEx.cfg`, set:

```ini
ScanMethodRefs = false
```

## Install the Mod

Build and install:

```sh
SAP_GAME_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets" \
  ./steam-mods/PackViewerInVersus/build-and-install-bepinex.sh
```

This copies:

```text
BepInEx/plugins/PackViewerInVersus.dll
```

## Steam Launch Option

Set SAP's Steam launch option to:

```text
"/Users/YOUR_USER/Library/Application Support/Steam/steamapps/common/Super Auto Pets/sap-bepinex-steam-launch.sh" %command%
```

Replace `YOUR_USER` with your macOS username.

## Validate

Launch SAP from Steam, then check:

```sh
tail -n 200 "$GAME_DIR/BepInEx/LogOutput.log"
```

Expected markers:

```text
SAP BepInEx Chainloader Kick
Loading [Pack Viewer In Versus 0.1.0]
Chainloader startup complete
```

In game:

1. Enter a versus match.
2. Open the opponent scoreboard/list.
3. Click an opponent pack icon.
4. The pack viewer should open for that row's pack.

## Debug

Useful keys:

- `F7`: try to open the opponent pack viewer.
- `F8`: dump diagnostics to the log.

Useful logs:

```sh
tail -n 300 "$HOME/Library/Logs/Team Wood/Super Auto Pets/Player.log"
tail -n 300 "$GAME_DIR/BepInEx/LogOutput.log"
```
