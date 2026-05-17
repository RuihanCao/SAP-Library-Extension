# Pack Viewer In Versus: MelonLoader Build

This is the MelonLoader build of the SAP pack-viewer mod.

It reuses the same game-facing logic as the BepInEx build, but starts from `MelonMod.OnUpdate()` and installs to:

```text
Super Auto Pets/Mods/PackViewerInVersus.dll
```

## Current Status

- Source build: succeeds locally.
- macOS SAP + MelonLoader: bootstrap injection was previously verified, but managed MelonLoader mod loading was not yet verified on this machine.
- Windows SAP + MelonLoader: likely the most useful community validation path because existing SAP visual mods already use MelonLoader there.

Local validation on macOS still fails before the mod can run:

```text
PASS bootstrap: native bootstrap injected and installed symbol redirect
FAIL runtime redirect: IL2CPP symbol redirect did not fire
FAIL hostfxr: managed .NET host did not start
FAIL mod: PackViewerInVersus did not load
```

## Build Locally

```sh
SAP_GAME_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets" \
  ./steam-mods/PackViewerInVersus.MelonLoader/build-and-install.sh
```

By default the build references:

```text
$SAP_GAME_DIR/MelonLoader/net6
$SAP_GAME_DIR/BepInEx/interop
```

If the target machine has MelonLoader-generated IL2CPP assemblies instead, point `UNITY_REFS_DIR` at that folder.

## Usage

1. Install MelonLoader for Steam Super Auto Pets.
2. Put `PackViewerInVersus.dll` in `Super Auto Pets/Mods`.
3. Launch SAP.
4. Enter versus.
5. Open the opponent scoreboard/list.
6. Click an opponent pack icon.

Custom packs are still out of scope. The current feature opens predefined/bought pack references from the opponent row's `Pack` value.
