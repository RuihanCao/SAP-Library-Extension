# SAP MelonLoader Mod Notes

Working notes for the Super Auto Pets Steam mod experiments.

## Local Environment

- Repo: `/Users/patrickliu/Desktop/Startups/SAP-Library-Extension`
- Steam game dir: `/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets`
- App bundle: `/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Super Auto Pets.app`
- Unity version observed: `6000.3.11f1`
- Backend observed: IL2CPP
- Steam app id: `1714040`
- macOS game binary is universal: `x86_64` and `arm64`

## Official Downloads Used

- MelonLoader release: `v0.7.3`
- MelonLoader Installer release: `4.3.0`
- Source: <https://github.com/LavaGang/MelonLoader/releases>
- Installer source: <https://github.com/LavaGang/MelonLoader.Installer/releases>

Assets downloaded during setup:

- `MelonLoader.macOS.x64.zip`
- `MelonLoader.Installer.MacOS.dmg`

The macOS MelonLoader bootstrap from `v0.7.3` is `x86_64`, so SAP must run under Rosetta for this loader path.

## Tooling Installed

The Homebrew `dotnet-sdk` cask required sudo and could not be installed unattended. Instead, a user-local .NET SDK was installed:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/dotnet/sdk/dotnet --info
```

Installed SDK:

- .NET SDK `6.0.428`
- Runtime `6.0.36`
- Path: `/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/dotnet/sdk`

For MelonLoader runtime under Rosetta, an x86_64 .NET runtime was installed into the SAP game directory:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/Dependencies/dotnet
```

Important file:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/Dependencies/dotnet/host/fxr/6.0.36/libhostfxr.dylib
```

## PackViewerInVersus Build

Mod source:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/PackViewerInVersus
```

Build command used:

```sh
cd /Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/PackViewerInVersus
export PATH="/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/dotnet/sdk:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export MELONLOADER_DLL="/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/net6/MelonLoader.dll"
export UNITY_REFS_DIR="/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/unityrefs/compile"
/bin/bash ./build.example.sh
```

Build succeeded with one architecture warning because `MelonLoader.dll` is AMD64 while the project is MSIL. Output:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/PackViewerInVersus/bin/Release/net6.0/PackViewerInVersus.dll
```

Installed DLL:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Mods/PackViewerInVersus.dll
```

## Unity References

SAP does not ship managed Unity assemblies because it is IL2CPP. Temporary compile references were assembled under:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/unityrefs/compile
```

References came from NuGet packages:

- `UnityEngine.Modules/2021.3.33`
- `Defiant_Zombie.KSP.Skeleton.UnityEngine.UI/1.11.2`

Important detail: extracted NuGet DLLs initially had mode `----------`, which made Roslyn report `Access to the path ... is denied`. Fix with:

```sh
chmod 0644 /Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/unityrefs/compile/*.dll
```

## MelonLoader Install State

Installed files in the SAP game dir:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader.Bootstrap.dylib
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/melonloader-launch.sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Mods
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Plugins
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/UserData
```

Steam launch option was added in:

```sh
/Users/patrickliu/Library/Application Support/Steam/userdata/973864689/config/localconfig.vdf
```

Value:

```text
"/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/melonloader-launch.sh" %command%
```

A backup exists:

```sh
/Users/patrickliu/Library/Application Support/Steam/userdata/973864689/config/localconfig.vdf.pre-melonloader
```

## macOS Wrapper Fix

The official `melonloader-launch.sh` needs Rosetta for the current x86_64 bootstrap. A first attempt changed the final exec to:

```sh
exec /usr/bin/arch -x86_64 "$@"
```

That was wrong: `arch` stripped the `DYLD_INSERT_LIBRARIES` path before SAP started, so the bootstrap did not inject.

The working approach is to re-exec the wrapper itself under Rosetta before setting `DYLD_INSERT_LIBRARIES`:

```sh
if [ "$(uname -m)" = "arm64" ] && [ -z "${ML_ROSETTA_REEXEC:-}" ]; then
    export ML_ROSETTA_REEXEC=1
    exec /usr/bin/arch -x86_64 /bin/bash "$0" "$@"
fi
```

Then keep the normal final line:

```sh
exec "$@"
```

Additional environment variables added:

```sh
export DYLD_LIBRARY_PATH="$SCRIPT_DIR"
export DOTNET_ROOT="$SCRIPT_DIR/MelonLoader/Dependencies/dotnet"
export DOTNET_BUNDLE_EXTRACT_BASE_DIR="$SCRIPT_DIR/MelonLoader/Dependencies/dotnet-bundle-cache"
```

## What Was Verified

Direct wrapper launch command:

```sh
cd "/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets"
./melonloader-launch.sh "./Super Auto Pets.app" --melonloader.debug --melonloader.captureplayerlogs
```

Verified via `lsof` that the SAP process loaded:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader.Bootstrap.dylib
```

Verified MelonLoader created and opened:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/Latest.log
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/Logs/26-5-15_22-47-34.log
```

Example bootstrap log lines:

```text
[BS DEBUG] Plt hooked fopen successfully
[BS DEBUG] Plt hooked vfprintf successfully
[BS DEBUG] Attaching Symbol Redirect...
[BS DEBUG] Symbol Redirect Attached!
```

This confirms native bootstrap injection.

## Current Blocker

MelonLoader currently reaches the native bootstrap phase but does not appear to reach the managed loader/mod-load phase.

Observed symptoms:

- `MelonLoader.Bootstrap.dylib` is loaded in the SAP process.
- `MelonLoader/Latest.log` and timestamped log files are created.
- Logs only contain bootstrap lines.
- No confirmed `PackViewerInVersus` load line yet.
- `PackViewerInVersus.dll` is present in `Mods`.
- Direct wrapper launch sits at early Unity startup.
- `steam://run/1714040` did not produce a newer managed-load log during the last check.

Likely next debugging targets:

- Check whether MelonLoader `v0.7.3` macOS bootstrap currently needs a different Unity entry hook for Unity `6000.3`.
- Check for a newer arm64/universal MelonLoader macOS build if one becomes available.
- If native macOS remains blocked, validate the same DLL on the Windows Steam build under Windows/CrossOver/Whisky, where MelonLoader's proxy path is more mature.

## Validation Criteria

For SAP MelonLoader to be considered fully validated, all of these must be true in `MelonLoader/Latest.log` or the newest timestamped log:

- Native bootstrap injected: lines like `Symbol Redirect Attached`.
- Runtime redirect fired: lines like `Initializing Runtime`, `Redirecting il2cpp_init`, or `Redirecting il2cpp_runtime_invoke`.
- Managed host started: lines like `Using .NET runtime`, `Using HostFXR Path`, or `Loading NativeHost assembly`.
- Mod loaded: a line containing `Pack Viewer In Versus` or `PackViewerInVersus`.

Creating `MelonLoader/Latest.log` is not enough. A bootstrap-only log means mods cannot load yet.

## 2026-05-17 MelonLoader Build Target

A MelonLoader-specific project now exists:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/PackViewerInVersus.MelonLoader
```

It reuses the loader-neutral PackViewer source files and adds:

- `MelonPackViewerInVersusMod`: `MelonMod` entrypoint.
- `MelonLoaderCompat`: small shims for the BepInEx logging/path APIs used by the shared source.
- `build-and-install.sh`: builds `PackViewerInVersus.dll` and installs it to SAP's `Mods` folder.

Build/install command:

```sh
cd /Users/patrickliu/Desktop/Startups/SAP-Library-Extension
./steam-mods/PackViewerInVersus.MelonLoader/build-and-install.sh
```

Result:

```text
PackViewerInVersus.MelonLoader -> steam-mods/PackViewerInVersus.MelonLoader/bin/Release/net6.0/PackViewerInVersus.dll
Installed /Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Mods/PackViewerInVersus.dll
```

Build status:

- Succeeds against local MelonLoader `0.7.3.0`.
- Emits one expected architecture warning because the local macOS MelonLoader reference is `AMD64` while the mod assembly is `MSIL`.

Validation status:

- Static layout checks pass.
- `MelonLoader.Bootstrap.dylib` injects and logs `Symbol Redirect Attached`.
- Runtime redirect still does not fire.
- HostFXR / managed MelonLoader does not start.
- `PackViewerInVersus` does not load.

Current conclusion:

The MelonLoader DLL can now be produced for users who already have a working MelonLoader SAP setup, especially Windows users. The local macOS SAP path remains blocked before managed mod loading, so no MelonLoader mod can run here yet.

Repeatable validation script:

```sh
cd /Users/patrickliu/Desktop/Startups/SAP-Library-Extension
./steam-mods/PackViewerInVersus/validate-sap-melonloader.sh
```

## Additional Tests Run

The MelonLoader `v0.7.3` macOS bootstrap source shows that native initialization is normally triggered via a `setrlimit` interpose, then MelonLoader hooks UnityPlayer's `dlsym` import and waits for Unity to request `il2cpp_init` or `il2cpp_runtime_invoke`.

Local observations:

- `GameAssembly.dylib` exports `_il2cpp_init`, `_il2cpp_runtime_invoke`, and related IL2CPP symbols.
- `UnityPlayer.dylib` imports `_dlsym`.
- MelonLoader logs `Plt hooked dlsym successfully`.
- MelonLoader never logs `Initializing Runtime` or `Redirecting il2cpp_init`.
- `lsof` confirms `MelonLoader.Bootstrap.dylib` is loaded, but no `hostfxr`, `dotnet`, or `MelonLoader.NativeHost` library is loaded.

An experimental x86_64 early-init shim was added under:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/macos-melonloader-early-init
```

It calls MelonLoader's exported `Init()` from a dylib constructor. This successfully printed:

```text
[MelonLoaderEarlyInit] calling MelonLoader.Bootstrap Init early
```

But the runtime redirect still did not fire. Setting `DYLD_FORCE_FLAT_NAMESPACE=1` also did not change the outcome.

Current conclusion: the local macOS SAP build has native bootstrap injection working, but MelonLoader `v0.7.3` does not reach the IL2CPP/managed phase on this Unity `6000.3.11f1` build. The most useful next validation path is either a newer MelonLoader macOS build that changes the Unity/IL2CPP hook path, or testing the same mod on the Windows SAP build.

## BepInEx Cross-Check

A parallel BepInEx path was also tested for the native macOS SAP Steam build. See:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/docs/sap-bepinex-mod-notes.md
```

BepInEx reaches the same class of blocker: native `libdoorstop.dylib` injection works under Rosetta, but CoreCLR/BepInEx managed loading does not start.

## Useful Commands

Check whether SAP is running:

```sh
pgrep -fl "Super Auto Pets"
```

Check whether the bootstrap is loaded:

```sh
lsof -p <pid> | rg -i "melon|dotnet|hostfxr|bootstrap|packviewer|latest|logs"
```

Read MelonLoader logs:

```sh
tail -200 "/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/Latest.log"
find "/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/MelonLoader/Logs" -type f -print -exec tail -120 {} \;
```

Read Unity player log:

```sh
tail -200 "/Users/patrickliu/Library/Logs/Team Wood/Super Auto Pets/Player.log"
```

Launch through Steam:

```sh
open "steam://run/1714040"
```

Direct launch through wrapper:

```sh
cd "/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets"
./melonloader-launch.sh "./Super Auto Pets.app" --melonloader.debug --melonloader.captureplayerlogs
```

Restore Steam launch config backup if needed:

```sh
cp "/Users/patrickliu/Library/Application Support/Steam/userdata/973864689/config/localconfig.vdf.pre-melonloader" \
   "/Users/patrickliu/Library/Application Support/Steam/userdata/973864689/config/localconfig.vdf"
```
