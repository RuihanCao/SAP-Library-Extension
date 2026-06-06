# Implementation Notes

## Why MelonLoader First

This starts with MelonLoader because the existing public SAP mods the user found are already distributed as MelonLoader DLLs. For a small client-side quality-of-life mod, matching the community's existing installation flow is more important than building a larger framework immediately.

BepInEx is still a reasonable later option if this grows into a suite with external tooling, config-heavy overlays, or reusable patch infrastructure.

## Feature Target

Add an in-versus pack viewer entry point:

- preferably near the existing pack icon/menu controls;
- opens the same full pack reference surface available from the main menu;
- lets users inspect pet and food descriptions from the whole pack during 1v1 decisions;
- remains client-side and informational.

## Diagnostic Data Needed

See also:

- [SAP MelonLoader Mod Notes](../../../docs/sap-melonloader-mod-notes.md) for the local macOS/Rosetta setup, exact install paths, and the current MelonLoader bootstrap blocker.
- [SAP BepInEx Mod Notes](../../../docs/sap-bepinex-mod-notes.md) for the parallel BepInEx setup, smoke plugin, validation script, and current Doorstop/CoreCLR blocker.

Collect `F8` logs from:

1. Main menu pack-card screen with the Unicorn pack visible.
2. Full pack reference screen.
3. Versus shop screen.

The useful log lines are the ones containing:

- pack card/button object paths;
- full pack reference panel/screen object paths;
- controller component type names;
- zero-argument methods with names like `OpenPack`, `ShowPack`, `OpenLibrary`, `ShowCollection`, or related button handlers.

## 2026-05-16 BepInEx E2E Findings

Validated:

- BepInEx loads under Rosetta through the local `sap-bepinex-steam-launch.sh`/direct wrapper path.
- `PackViewerInVersus.dll` is discovered and `Load()` runs.
- Strongly referencing `BepInEx/interop/Assembly-CSharp.dll` avoids the earlier dynamic `Assembly.LoadFrom`/`AccessTools.TypeByName` warning.
- Computer Use can pass SAP's initial loading screen with pixel clicks, but main-menu button activation is still inconsistent.

Current blockers:

- The local `SapBepInExChainloaderKick` forces `IL2CPPChainloader.Execute()` from a background thread. This is enough for plain plugin `Load()` logging, but Unity-facing mod work is not healthy from that path.
- `BasePlugin.AddComponent<PackViewerDriver>()` fails with `Il2CppInterop.Runtime.Injection.InjectorHelpers` throwing `Sequence contains no matching element`, so a global managed `MonoBehaviour` driver cannot be installed yet.
- Harmony reports successful patches for existing SAP `Update()` methods, but the postfixes do not fire. Treat this as another symptom of the current IL2CPP runtime/chainloader path rather than a button placement bug.
- UnityExplorer was tried as a pass/fail diagnostic using the official `UnityExplorer.BepInEx.IL2CPP.CoreCLR.zip` release and `Startup Delay Time = 10`. The subfolder install was not discovered by the current BepInEx path, and placing the DLLs directly in `BepInEx/plugins/` made SAP exit before chainloader fallback/plugin discovery. It is now disabled under `BepInEx/plugins.disabled/unityexplorer/`.

Additional diagnostics from the SAP Steam launch path:

- Added `SAP_CHAINLOADER_KICK_DELAY_MS` support through `.sap-bepinex-env`. With a 60 second delay, SAP reached the main menu and BepInEx still did not load plugins until the fallback fired. This means the normal BepInEx `Internal_ActiveSceneChanged` trigger is not firing in this macOS/SAP setup.
- Added `PackViewerInVersus.debug` flags for `addComponent`, `harmony`, `frameHeartbeat`, and `hookTargets`.
- `addComponent=true` is unsafe right now. It throws `Il2CppInterop.Runtime.Injection.InjectorHelpers` / `Sequence contains no matching element` and correlated with failed/unstable launches. Keep it off until Il2CppInterop class injection is fixed.
- Harmony self-test on `UnityEngine.Application.unityVersion` succeeds when the plugin calls the managed property wrapper itself.
- Harmony patches on SAP lifecycle methods, including `Spacewood.Unity.Menu.Start`, install successfully but do not fire when Unity reaches `Menu > Start`. A parameterless postfix also did not fire. Current interpretation: plugin-time Harmony is patching managed interop wrappers, while Unity is invoking native IL2CPP methods directly.
- Broad `Update()` hook experiments can stall startup/loading. Keep hooks allowlisted one at a time while debugging.

Current stable local debug config:

```text
addComponent=false
harmony=false
frameHeartbeat=false
hookTargets=menuStart
```

Most useful next step:

Fix the Unity 6/macOS IL2CPP runtime layer before continuing UI work. Either update/patch BepInEx/Il2CppInterop for Unity 6000.3, or replace the background-thread chainloader kick with a main-thread/Unity callback path. After `AddComponent<T>()`, UnityExplorer, or a native IL2CPP method detour works, return to button placement and pack-viewer invocation.

## 2026-05-16 UnityExplorer Pass/Fail Result

Tested:

- Official UnityExplorer BepInEx 6 IL2CPP/CoreCLR build: `UnityExplorer.BepInEx.IL2CPP.CoreCLR.zip`.
- Config file: `BepInEx/config/com.sinai.unityexplorer.cfg`.
- Startup delay: `Startup Delay Time = 10`.
- PackViewer debug config kept stable: `addComponent=false`, `harmony=false`, `frameHeartbeat=false`.

Outcome:

- `BepInEx/plugins/sinai-dev-UnityExplorer/` layout: SAP launched, but UnityExplorer was not discovered. Log still reported only `PackViewerInVersus`.
- Root plugin layout with `UnityExplorer.BIE.IL2CPP.CoreCLR.dll` and `UniverseLib.IL2CPP.Interop.dll` directly under `BepInEx/plugins/`: SAP exited before plugin discovery. No UnityExplorer UI or load marker appeared.
- After moving those DLLs to `BepInEx/plugins.disabled/unityexplorer/`, the Steam-launched PackViewer-only control run succeeded again and logged `Chainloader startup complete`.

Decision:

Do not keep iterating on UI/button placement with this runtime state. UnityExplorer failed at the same layer as `AddComponent<T>()`: BepInEx/Il2CppInterop/CoreCLR compatibility with SAP's Unity 6000.3 macOS IL2CPP build. The next engineering step should be a loader/runtime fix or a native IL2CPP detour proof of concept.

## 2026-05-17 Runtime Canary Follow-Up

Added PackViewer debug canaries:

- `classInjectionCanary`: directly calls `ClassInjector.RegisterTypeInIl2Cpp<PackViewerCanaryBehaviour>()`.
- `canvasCanary`: tries `Canvas.willRenderCanvases` via Il2Cpp delegate conversion.
- `addUnityComponentCanary`: tries `IL2CPPChainloader.AddUnityComponent`.
- `nativeCanvasDetourCanary`: experimental native detour against `Canvas.SendWillRenderCanvases`.

Findings:

- Direct class injection fails with `InjectorHelpers` / `Sequence contains no matching element`.
- Canvas delegate subscription also fails because `DelegateSupport.ConvertDelegate` uses the same injection helper.
- The native detour path needs a better target-pointer proof before enabling. The first attempt was backed off because it caused unstable launches.
- Replacing core interop files with `cetotos/Il2CppInterop-Unity6` `v1.0.0` allowed clean regeneration for metadata version `39`, but did not fix `InjectorHelpers`.
- `InjectorHelpers` source expects `GameAssembly.dll`, `GameAssembly.so`, or `UserAssembly.dll`. SAP macOS loads `GameAssembly.dylib`, while CoreCLR `Process.Modules` exposed only `Super Auto Pets` as a useful candidate in-plugin. A simple string patch was not enough.

Updated result:

- `NativeLibrary.Load("GameAssembly")` works on macOS and resolves IL2CPP exports.
- Patching only the `InjectorHelpers` module-name predicate to match CoreCLR's visible `ProcessModule.ModuleName`, `Super Auto Pets`, fixes class injection.
- The earlier launch instability was the chainloader delay race. Setting `SAP_CHAINLOADER_KICK_DELAY_MS=0` makes plugin loading reliable again.
- `Canvas.willRenderCanvases` now works if subscription is delayed until after plugin load. This gives a usable Unity callback without `AddComponent<T>()`.
- `IL2CPPChainloader.AddUnityComponent` remains disabled; it reached the add call and then stopped before chainloader completion.

Current safe config:

```text
addComponent=false
harmony=false
frameHeartbeat=false
canvasCanary=true
canvasTick=true
canvasSubscribeDelayMs=3000
classInjectionCanary=false
addUnityComponentCanary=false
nativeCanvasDetourCanary=false
nativeCanvasTick=false
hookTargets=menuStart
```

Current local env:

```text
SAP_CHAINLOADER_KICK_DELAY_MS=0
```

Repeatable runtime patch:

```sh
./steam-mods/PackViewerInVersus/patch-il2cppinterop-runtime-macos.sh
```

Validated behavior:

- PackViewer loads.
- Canvas callback fires in `Bootstrap`, `Menu`, and `Build`.
- Overlay button installs under `Global(Clone)/Quantum Console`.
- Button click is detected.
- F7/F8 are detected.

Remaining blocker:

- Click/F7 calls reach `PackViewerLauncher`, but launcher cannot find the actual pack-viewer opener yet: `no HangarMain instance was available`.

## 2026-05-17 Pack Viewer Opener Debugging

Assembly reflection shows the first launcher assumption was too narrow.

Important types/methods found in `BepInEx/interop/Assembly-CSharp.dll`:

- `Spacewood.Unity.MonoBehaviours.Build.HangarMain`
  - `DeckViewer`
  - `HandleDeckViewerSubmit(DeckViewer)`
  - `HandleDeckViewerButtonSubmit(SelectableBase)`
- `Spacewood.Unity.MonoBehaviours.Build.Hangar.States.HangarStateBase`
  - `OnDeckViewerSubmit(DeckViewer)`
  - `OnDeckViewerButtonSubmit(SelectableBase)`
- `Spacewood.Unity.MonoBehaviours.Build.DeckViewer`
  - `HandleClick()`
  - `SetModel(Pack, DeckModel, Nullable<int>, bool)`
- `Spacewood.Unity.PackShop`
  - `DeckViewer`
  - `HandleDeckViewerClick(DeckViewer)`
  - `HandlePackPreview(ProductView)`
  - `Preview(Pack, DeckModel)`

The efficient debug order is:

1. Stay off UnityExplorer unless our own scanner cannot see the objects. UnityExplorer is broader but heavier and previously failed at the same loader/runtime layer.
2. Use F8 in the main-menu pack reference and in a versus shop to compare live `HangarMain`, `DeckViewer`, `PackShop`, and `PackProduct` instances.
3. Prefer calling SAP's existing handlers in this order: `HangarMain.HandleDeckViewerSubmit(DeckViewer)`, `HangarStateBase.OnDeckViewerSubmit(DeckViewer)`, `PackShop.HandleDeckViewerClick(DeckViewer)`, then `DeckViewer.HandleClick()`.
4. Only if those handlers are missing or the `DeckViewer` has no model, move to copying pack/deck context into `DeckViewer.SetModel(...)`.

Code update installed:

- F8 diagnostics now dump exact/fuzzy matches for `HangarMain`, `HangarStateBase`, `DeckViewer`, `PackShop`, `PackProduct`, `DeckBuilder`, and related objects, including key properties and method signatures.
- F7/button opener now tries the known game handlers above instead of only looking for `HangarMain` from the hook context.
- The temporary button no longer installs under `Quantum Console`; it now prefers SAP's real `TopRightCanvas`/overlay canvases, and hit-testing uses the canvas event camera.

The updated DLL is installed, but an already-running SAP process must be restarted before these changes can run.

Validation update:

- Computer Use can restart SAP, click through the loading screen, and send F7/F8 to the game window.
- In the actual `Build`/shop scene, F7 successfully opened the pack viewer panel via:

```text
HangarMain.HandleDeckViewerSubmit(DeckViewer)
hangar=Build/Hangar
deckViewer=Build/Hangar/DeckViewer
```

- This is the correct in-match opener for the pack reference panel. Menu/PackShop routes are useful diagnostics only; the versus/shop route should prefer `HangarMain.HandleDeckViewerSubmit`.
- The feature target changed from "my current pack" to "opponent's predefined pack." Reflection shows the data path is:

```text
HangarMain.MatchModel
  -> UserMatchModel.Versus
  -> UserMatchModelVersus.Opponents
  -> UserVersusOpponent.Pack
```

- `UserVersusOpponent` also exposes `UserId`, `ParticipationId`, `BoardAdjective`, `BoardNoun`, `Lives`, and `WildPack`. For 1v1, prefer the opponent matching `Versus.NextOpponentId` when present, otherwise prefer the first participation id that differs from `UserMatchModel.ParticipationId`.
- The current implementation now tries to open that opponent pack first by calling `DeckViewer.SetModel(pack, null, emptyTier, custom:false)` and then `HangarMain.HandleDeckViewerSubmit(DeckViewer)`. If the match model is not a versus model or the opponent read fails, it falls back to the previous current-pack/menu diagnostics route.
- Custom packs remain out of scope for now. The current route only passes a predefined `Pack` enum value, with no custom `DeckModel`.
- The production interaction no longer needs the floating debug `?` button. Click handling now scans active `HangarScoreboardEntry` rows and treats the existing pack icon rects (`PackContainer`, `PackStandard`, `PackCustom`, `PackChallenge`, `PackStandardImage`) as click targets. A click on a row's pack icon reads that row's `HangarScoreboardEntry.Opponent.Pack` and opens the pack viewer for that exact row.
- The floating button and debug overlay are now opt-in only through `PackViewerInVersus.debug` flags: `floatingButton=true` and `debugOverlay=true`.

## Likely Final Shape

Once the controller names are known:

1. Validate clicking the actual scoreboard pack icon in full scoreboard and mini scoreboard states.
2. If users want a visible affordance, add a subtle hover/press effect around the existing pack icon instead of reintroducing a separate button.
3. Investigate custom pack support separately by finding whether the opponent `DeckModel` exists in network/model cache. The row model exposes `Pack`/`WildPack` but not the full custom deck.
