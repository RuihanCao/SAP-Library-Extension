# Windows Install: BepInEx 6 IL2CPP

These notes are for Steam Super Auto Pets on Windows.

Windows support is expected from the normal BepInEx 6 IL2CPP path, but this repo has only been end-to-end validated on macOS so far.

## Requirements

- Steam Super Auto Pets installed.
- BepInEx 6 Unity IL2CPP Windows x64 build.
- .NET SDK 6 or newer if building locally.
- A built `PackViewerInVersus.dll`.

## Install BepInEx

Download a BepInEx 6 Unity IL2CPP Windows x64 build from:

<https://builds.bepinex.dev/projects/bepinex_be>

Extract it into the SAP game root.

Typical Steam path:

```text
C:\Program Files (x86)\Steam\steamapps\common\Super Auto Pets
```

The game root should contain files/folders like:

```text
BepInEx\
dotnet\
doorstop_config.ini
winhttp.dll
Super Auto Pets.exe
```

Launch SAP once from Steam after installing BepInEx. This lets BepInEx generate the IL2CPP interop assemblies under:

```text
BepInEx\interop\
```

## Install the Mod

If you already have `PackViewerInVersus.dll`, copy it to:

```text
C:\Program Files (x86)\Steam\steamapps\common\Super Auto Pets\BepInEx\plugins\PackViewerInVersus.dll
```

If building from this repo:

```bat
set SAP_GAME_DIR=C:\Program Files (x86)\Steam\steamapps\common\Super Auto Pets

dotnet build steam-mods\PackViewerInVersus\PackViewerInVersus.csproj ^
  -c Release ^
  -p:BEPINEX_CORE_DIR="%SAP_GAME_DIR%\BepInEx\core" ^
  -p:UNITY_REFS_DIR="%SAP_GAME_DIR%\BepInEx\interop"

copy steam-mods\PackViewerInVersus\bin\Release\net6.0\PackViewerInVersus.dll "%SAP_GAME_DIR%\BepInEx\plugins\"
```

No macOS wrapper, delayed bootstrap, or chainloader patch is expected to be needed on Windows.

## Validate

Launch SAP from Steam, then check:

```text
C:\Program Files (x86)\Steam\steamapps\common\Super Auto Pets\BepInEx\LogOutput.log
```

Expected markers:

```text
Loading [Pack Viewer In Versus 0.1.0]
```

In game:

1. Enter a versus match.
2. Open the opponent scoreboard/list.
3. Click an opponent pack icon.
4. The pack viewer should open for that row's pack.

## Troubleshooting

If the build cannot find `Assembly-CSharp.dll`, `SpacewoodCore2.dll`, or Unity assemblies, launch SAP once with BepInEx installed and then retry. Those references come from BepInEx's generated `BepInEx\interop` folder.

If SAP crashes before the main menu, first confirm BepInEx works without this mod installed, then add `PackViewerInVersus.dll` back to `BepInEx\plugins`.
