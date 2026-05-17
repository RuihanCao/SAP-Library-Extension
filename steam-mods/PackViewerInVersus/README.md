# Pack Viewer In Versus

Client-side Super Auto Pets quality-of-life mod for Steam SAP.

The validated build is a BepInEx 6 IL2CPP mod. A MelonLoader build target now also exists for community testing, but macOS SAP + MelonLoader still has a loader-level managed-startup blocker on this machine.

## What It Does

In versus, click an opponent's pack icon in the scoreboard/opponent list to open the normal in-game pack viewer for that opponent's predefined pack.

Useful for quickly checking what pets and foods are in the opponent's pack during 1v1 decisions.

## Current Support

- Loader: BepInEx 6 IL2CPP/CoreCLR
- Game: Steam Super Auto Pets
- Platforms:
  - macOS: tested with the compatibility wrapper in this repo
  - Windows: expected to work with a normal BepInEx 6 IL2CPP install, but not yet validated here
- Packs:
  - predefined/standard/bought packs: supported
  - custom packs: not supported yet

Custom packs are not supported because the visible scoreboard row exposes `Opponent.Pack` and `Opponent.WildPack`, but not the full custom `DeckModel`.

## Install

Start with the platform-specific notes:

- [macOS BepInEx install](docs/install-macos-bepinex.md)
- [Windows BepInEx install](docs/install-windows-bepinex.md)

After BepInEx is working, install:

```text
BepInEx/plugins/PackViewerInVersus.dll
```

## Usage

1. Launch SAP with BepInEx enabled.
2. Enter a versus match.
3. Open the opponent scoreboard/list.
4. Click the opponent's pack icon.
5. The normal pack viewer opens for that row's pack.

Debug hotkeys are still available:

- `F7`: attempt to open the next/current opponent pack viewer.
- `F8`: dump UI/model diagnostics to SAP's player log.

## Building

This project builds against BepInEx's generated IL2CPP interop assemblies.

```sh
cd steam-mods/PackViewerInVersus
SAP_GAME_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Super Auto Pets" \
  ./build-and-install-bepinex.sh
```

Expected local references:

```text
$SAP_GAME_DIR/BepInEx/core
$SAP_GAME_DIR/BepInEx/interop
```

The build output is:

```text
steam-mods/PackViewerInVersus/bin/Release/net6.0/PackViewerInVersus.dll
```

## Compatibility Notes

MelonLoader users should not try to run the BepInEx DLL directly. Use the separate MelonLoader project instead:

```text
steam-mods/PackViewerInVersus.MelonLoader
```

That build has its own Melon entrypoint/logging/bootstrap layer and reuses the same core feature code:

- find `HangarScoreboardEntry`
- read `entry.Opponent.Pack`
- call `DeckViewer.SetModel(pack, null, tier, false)`

Running MelonLoader and BepInEx together in the same SAP install is not recommended.

## Repo Layout

- `src/PackViewerLauncher.cs`: opens the SAP deck viewer for a specific pack.
- `src/OpponentPackIconClickRouter.cs`: maps clicks on scoreboard pack icons to the correct row.
- `docs/implementation-notes.md`: detailed reverse-engineering and debugging notes.
- `sap-bepinex-steam-launch.sh`: macOS Steam launch wrapper.
- `../SapBepInExChainloaderKick`: macOS BepInEx chainloader compatibility patcher.
- `../macos-bepinex-delayed-bootstrap`: macOS delayed Doorstop bootstrap helper.
