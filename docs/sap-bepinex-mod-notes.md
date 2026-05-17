# SAP BepInEx Mod Notes

Working notes for the Super Auto Pets Steam BepInEx experiment on macOS.

## Local Environment

- Repo: `/Users/patrickliu/Desktop/Startups/SAP-Library-Extension`
- Steam game dir: `/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets`
- App bundle: `/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Super Auto Pets.app`
- Unity version observed: `6000.3.11f1`
- Backend observed: IL2CPP
- macOS game binary is universal: `x86_64` and `arm64`

## Official References

- BepInEx IL2CPP install guide: <https://docs.bepinex.dev/master/articles/user_guide/installation/unity_il2cpp.html>
- BepInEx Bleeding Edge builds: <https://builds.bepinex.dev/projects/bepinex_be>

The official IL2CPP guide says macOS IL2CPP games should use a `Unity.IL2CPP-macos-x64` bleeding edge build, extract it into the game root where the `.app` lives, then first launch should create `BepInEx/LogOutput.txt`.

## Downloads Tested

### `be.754+c038613`

Downloaded:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/bepinex/BepInEx-Unity.IL2CPP-macos-x64-6.0.0-be.754+c038613.zip
```

SHA256:

```text
0a89284d6026a8f7a6ab57e6cfe8c5dded235590bdff1cabc3954a05b76c3500
```

Result: native Doorstop injection worked, but CoreCLR/BepInEx did not load.

### `be.755+3fab71a`

Downloaded:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/bepinex/BepInEx-Unity.IL2CPP-macos-x64-6.0.0-be.755+3fab71a.zip
```

SHA256:

```text
0e9147d0d3ca88607bfc11b771a771ac2c83224d349ede2c12aed8859172349e
```

This is currently the most useful tested build because the official build page lists a Unity 6+ IL2CPP metadata improvement for `be.755`.

Result: same as `be.754`; native Doorstop injection worked, but CoreCLR/BepInEx did not load.

Follow-up result: this was narrowed down and worked around locally. See "macOS Compatibility Findings" below.

## Installed Files

Current BepInEx install in the SAP game root:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/BepInEx
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/dotnet
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/libdoorstop.dylib
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/run_bepinex.sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/.doorstop_version
```

Additional local compatibility files used for the validated macOS path:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/Data -> Super Auto Pets.app/Contents/Resources/Data
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/GameAssembly.dylib -> Super Auto Pets.app/Contents/Frameworks/GameAssembly.dylib
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/macos-bepinex-delayed-bootstrap/BepInExDelayedBootstrap.dylib
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/BepInEx/patchers/SapBepInExChainloaderKick.dll
```

Important architecture detail:

- `libdoorstop.dylib` is universal `x86_64` and `arm64`.
- `dotnet/libcoreclr.dylib` is `x86_64` only.
- `Super Auto Pets.app/Contents/MacOS/Super Auto Pets` is universal `x86_64` and `arm64`.

Because CoreCLR is `x86_64` only, Apple Silicon must run SAP under Rosetta for this BepInEx build.

## macOS Runner Patch

The stock `run_bepinex.sh` from both tested builds used:

```sh
export ARCHPREFERENCE="arm64,x86_64"
```

That lets SAP run arm64 on Apple Silicon, which cannot load the x86_64 CoreCLR runtime included in the official macOS x64 BepInEx archive.

The installed runner was patched to:

```sh
export ARCHPREFERENCE="x86_64,arm64"
```

Validation confirmed the process then ran under Rosetta and loaded:

```text
/Library/Apple/usr/libexec/oah/libRosettaRuntime
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/libdoorstop.dylib
```

## Smoke Plugin

A minimal BepInEx smoke plugin was added so the validation path has a concrete plugin-load marker:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/steam-mods/PackViewerInVersus.BepInExSmoke
```

Build/install command:

```sh
cd /Users/patrickliu/Desktop/Startups/SAP-Library-Extension
./steam-mods/PackViewerInVersus.BepInExSmoke/build-and-install.sh
```

Installed DLL:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/BepInEx/plugins/PackViewerInVersus.BepInExSmoke.dll
```

Expected log marker if BepInEx reaches plugin loading:

```text
PackViewerInVersus BepInEx smoke plugin loaded.
```

That marker has been observed with the local macOS compatibility path described below.

## macOS Compatibility Findings

The official `Unity.IL2CPP-macos-x64` BepInEx build is close, but SAP's current macOS/Unity 6 layout needs workarounds:

- Doorstop injection reaches native code, but the normal macOS IL2CPP bootstrap path does not reliably enter plugin loading.
- SAP stores Unity data inside the app bundle, while BepInEx expects root-level Unity-style paths. The validated setup adds root-level symlinks for `Data` and `GameAssembly.dylib`.
- Il2CppInterop generation fails with `ScanMethodRefs = true` on this build. The validated config sets `ScanMethodRefs = false` in `BepInEx/config/BepInEx.cfg`.
- BepInEx logs `Chainloader initialized`, but its normal IL2CPP trigger does not call `Execute()`. The local `SapBepInExChainloaderKick` preloader patcher bridges that by calling `IL2CPPChainloader.Instance.Execute()` after initialization.

Validated success markers:

```text
[Info   : Preloader] 1 patcher plugin loaded
[Info   :SAP BepInEx Chainloader Kick] Forcing IL2CPP chainloader Execute().
[Info   :   BepInEx] 1 plugin to load
[Info   :   BepInEx] Loading [PackViewerInVersus BepInEx Smoke 0.1.0]
[Info   :PackViewerInVersus BepInEx Smoke] PackViewerInVersus BepInEx smoke plugin loaded.
[Message:   BepInEx] Chainloader startup complete
```

## Validation Script

Repeatable validation:

```sh
cd /Users/patrickliu/Desktop/Startups/SAP-Library-Extension
./steam-mods/PackViewerInVersus/validate-sap-bepinex.sh
```

The validator checks:

- BepInEx files exist in the SAP game root.
- `run_bepinex.sh` prefers `x86_64` before `arm64`.
- SAP launches through the BepInEx runner/direct compatibility launch.
- `libdoorstop.dylib` appears in the live process.
- CoreCLR or BepInEx managed markers appear.
- `BepInEx/LogOutput.log` or `BepInEx/LogOutput.txt` exists.
- The chainloader-kick patcher appears.
- The smoke plugin load marker appears.

## Current Result

BepInEx is fully validated for the native macOS SAP Steam build using the local compatibility path.

Confirmed:

- SAP launches through `run_bepinex.sh`.
- SAP runs under Rosetta after the runner patch.
- `libdoorstop.dylib` injects into the SAP process.
- UnityPlayer and GameAssembly are loaded under Rosetta.
- The BepInEx smoke plugin builds and is installed.
- CoreCLR and the BepInEx preloader start.
- Il2CppInterop generation completes with `ScanMethodRefs = false`.
- The chainloader-kick patcher loads from `BepInEx/patchers`.
- Normal plugins load from `BepInEx/plugins`.
- The smoke plugin `Load()` method runs.

Not yet productionized:

- The delayed bootstrap shim and chainloader-kick patcher are local compatibility workarounds, not a clean upstream loader fix.
- Steam launch-option packaging still needs cleanup once the actual pack-viewer plugin is ready.

## Practical Conclusion

BepInEx is now a viable path for the SAP pack-viewer mod on this Mac because it reached managed plugin loading and executed the smoke plugin.

Pack-viewer E2E debugging found a second layer after basic plugin loading:

- A delayed chainloader test (`SAP_CHAINLOADER_KICK_DELAY_MS=60000`) showed the normal BepInEx scene-change trigger does not load plugins, even after SAP reaches the main menu. The local fallback is still required.
- `BasePlugin.AddComponent<T>()` currently fails in Il2CppInterop class injection (`InjectorHelpers` / `Sequence contains no matching element`).
- Harmony can patch managed wrappers called by the plugin itself, but SAP lifecycle methods patched from interop assemblies did not fire when Unity invoked those lifecycle methods.
- Keep production code off of broad Harmony `Update()` hooks until native IL2CPP detouring or class injection is validated.

## UnityExplorer Diagnostic

UnityExplorer was tested as a pass/fail diagnostic, not as a feature dependency.

Official references:

- UnityExplorer releases: <https://github.com/sinai-dev/UnityExplorer/releases>
- UnityExplorer README install notes: <https://github.com/sinai-dev/UnityExplorer>
- Startup delay setting source: <https://github.com/sinai-dev/UnityExplorer/blob/master/src/Config/ConfigManager.cs>

Tested asset:

```text
UnityExplorer.BepInEx.IL2CPP.CoreCLR.zip
```

Local download:

```sh
/Users/patrickliu/Desktop/Startups/SAP-Library-Extension/.tmp/unityexplorer/UnityExplorer.BepInEx.IL2CPP.CoreCLR.zip
```

Config created:

```ini
[UnityExplorer]
Startup Delay Time = 10
Hide On Startup = false
UnityExplorer Toggle = F7
```

Results:

- Installing the official folder layout under `BepInEx/plugins/sinai-dev-UnityExplorer/` was not discovered by the current BepInEx path. Logs still showed `1 plugin to load`, only `PackViewerInVersus`.
- Installing the two UnityExplorer DLLs directly under `BepInEx/plugins/` caused SAP to exit before `SapBepInExChainloaderKick` could force `IL2CPPChainloader.Execute()`. `BepInEx/LogOutput.log` stopped before plugin discovery, and no UnityExplorer/UniverseLib plugin load marker appeared.
- A Steam-launched control run after disabling UnityExplorer succeeded again: BepInEx reached `1 plugin to load`, loaded `PackViewerInVersus`, and completed chainloader startup with `addComponent=false` and `harmony=false`.

UnityExplorer is now disabled here:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/BepInEx/plugins.disabled/unityexplorer/UnityExplorer.BIE.IL2CPP.CoreCLR.dll
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/BepInEx/plugins.disabled/unityexplorer/UniverseLib.IL2CPP.Interop.dll
```

Conclusion: UnityExplorer does not get past the current SAP macOS/BepInEx 6 IL2CPP/CoreCLR runtime layer. Stop UI work until the underlying Unity 6000.3 Il2CppInterop/class-injection or native-detour path is fixed.

## Unity Runtime Canary Results

PackViewer now has gated runtime canaries in `PackViewerInVersus.debug`:

```text
canvasCanary=false
canvasTick=false
classInjectionCanary=false
addUnityComponentCanary=false
nativeCanvasDetourCanary=false
nativeCanvasTick=false
```

Results:

- `ClassInjector.RegisterTypeInIl2Cpp<PackViewerCanaryBehaviour>()` is a minimal repro for the current class-injection failure. It fails in `Il2CppInterop.Runtime.Injection.InjectorHelpers` with `Sequence contains no matching element`.
- `Canvas.willRenderCanvases` is not a workaround. Subscribing a managed callback requires `DelegateSupport.ConvertDelegate`, which enters the same `InjectorHelpers`/class-injection path and fails the same way.
- A direct native detour canary was added, but the first `Canvas.SendWillRenderCanvases` method-pointer attempt was too risky and caused unstable launches before plugin load. Keep `nativeCanvasDetourCanary=false` until the target pointer/signature is independently verified.

The useful root-cause clue is in `InjectorHelpers`: the current helper searches `Process.GetCurrentProcess().Modules` for `GameAssembly.dll`, `GameAssembly.so`, or `UserAssembly.dll`. SAP on macOS uses `GameAssembly.dylib`, and under the Rosetta/CoreCLR path `Process.Modules` only exposed `Super Auto Pets` as a useful candidate from inside the plugin. A simple string patch to `GameAssembly.dylib` did not fix class injection. A follow-up patch to match `Super Auto Pets` made launches unstable, so it was backed out.

Follow-up result: the `Super Auto Pets` module-name patch is correct when paired with the existing `NativeLibrary.Load("GameAssembly")` export path. The earlier instability was a separate chainloader timing race. With `SAP_CHAINLOADER_KICK_DELAY_MS=0`, the class-injection canary succeeds:

```text
PV class-injection canary: registering PackViewerCanaryBehaviour with Il2Cpp ClassInjector.
Class::Init signatures have been exhausted, using a substitute!
Registered mono type PackViewerInVersus.PackViewerCanaryBehaviour in il2cpp domain
PV class-injection canary succeeded.
```

Repeatable patch command:

```sh
cd /Users/patrickliu/Desktop/Startups/SAP-Library-Extension
./steam-mods/PackViewerInVersus/patch-il2cppinterop-runtime-macos.sh
```

Current chainloader environment:

```text
SAP_CHAINLOADER_KICK_DELAY_MS=0
```

## Il2CppInterop Unity 6 Fork Test

Tested release:

```text
https://github.com/cetotos/Il2CppInterop-Unity6/releases/tag/v1.0.0
```

Installed over the BepInEx core interop layer:

```text
Il2CppInterop.Runtime.dll
Il2CppInterop.Common.dll
Il2CppInterop.Generator.dll
Il2CppInterop.HarmonySupport.dll
Cpp2IL.Core.dll
LibCpp2IL.dll
AsmResolver*.dll
AssetRipper*.dll
StableNameDotNet.dll
WasmDisassembler.dll
```

Backup:

```sh
/Users/patrickliu/Library/Application Support/Steam/steamapps/common/Super Auto Pets/BepInEx/backups/il2cppinterop-20260517-001122
```

Result:

- The fork successfully regenerated 152 interop assemblies for Unity `6000.3.11f1` / IL2CPP metadata version `39`.
- PackViewer still loads with all risky canaries disabled.
- The fork alone did not fix SAP macOS class injection.
- The currently installed runtime is the Unity6 fork plus the local macOS module-name patch from `UserAssembly.dll`/`GameAssembly.dylib` to `Super Auto Pets`.

## Current Unity Callback Path

`BasePlugin.AddComponent<T>()` / `IL2CPPChainloader.AddUnityComponent()` is still not the right tick path. `AddUnityComponent` reached the call and then stopped logging before chainloader completion, so it remains disabled.

The validated tick path is:

```text
chainloader kick delay 0
PackViewer Load returns quickly
background delay 3000 ms
Canvas.willRenderCanvases delegate subscription
MainThreadUiTick.Tick from the Canvas callback
```

Validated config:

```text
addComponent=false
harmony=false
canvasCanary=true
canvasTick=true
canvasSubscribeDelayMs=3000
classInjectionCanary=false
addUnityComponentCanary=false
nativeCanvasDetourCanary=false
```

Observed success markers:

```text
PV canvas canary subscribed to Canvas.willRenderCanvases
PV canvas canary fired: ... scene='Bootstrap'
PV hook fired: context=...CanvasHookContext
Installed Pack Viewer button under canvas 'Global(Clone)/Quantum Console'
Pack Viewer overlay button clicked.
```

The current remaining feature blocker is not the runtime layer. The button click fires, but `PackViewerLauncher` cannot yet find the actual SAP pack-viewer opener:

```text
Could not open pack viewer because no HangarMain instance was available.
No conservative pack-viewer method candidates found.
```

The next feature step is pack-viewer opener discovery. The runtime now has a working class-injection path and a Canvas-driven callback path, so continue by mapping the real SAP pack reference UI/controller methods and replacing the placeholder `PackViewerLauncher` reflection guesses.
