using BepInEx;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;
using System.Reflection;
using System.Threading;
using UnityEngine;

namespace PackViewerInVersus;

[BepInPlugin("sap.library.pack-viewer-in-versus", "Pack Viewer In Versus", "0.1.0")]
public sealed class PackViewerInVersusMod : BasePlugin
{
    private Harmony _harmony;

    public override void Load()
    {
        Log.LogInfo($"Loaded BepInEx mod on managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'. Installing pack-viewer UI hooks.");
        OverlayButtonInstaller.Logger = Log;
        MainThreadUiTick.Logger = Log;

        if (DebugConfig.IsEnabled("canvasCanary", defaultValue: false))
        {
            UnityRuntimeCanaries.InstallCanvasWillRenderCanary(Log);
        }
        else
        {
            Log.LogInfo("Skipping Canvas.willRenderCanvases main-thread canary because debug flag canvasCanary is disabled.");
        }

        if (DebugConfig.IsEnabled("classInjectionCanary", defaultValue: false))
        {
            UnityRuntimeCanaries.RunClassInjectionCanary(Log);
        }
        else
        {
            Log.LogInfo("Skipping Il2Cpp class-injection canary because debug flag classInjectionCanary is disabled.");
        }

        if (DebugConfig.IsEnabled("nativeLibraryCanary", defaultValue: false))
        {
            UnityRuntimeCanaries.RunNativeLibraryCanary(Log);
        }
        else
        {
            Log.LogInfo("Skipping native library resolver canary because debug flag nativeLibraryCanary is disabled.");
        }

        if (DebugConfig.IsEnabled("addUnityComponentCanary", defaultValue: false))
        {
            UnityRuntimeCanaries.RunAddUnityComponentCanary(Log);
        }
        else
        {
            Log.LogInfo("Skipping IL2CPPChainloader.AddUnityComponent canary because debug flag addUnityComponentCanary is disabled.");
        }

        if (DebugConfig.IsEnabled("nativeCanvasDetourCanary", defaultValue: false))
        {
            UnityRuntimeCanaries.InstallNativeCanvasDetourCanary(Log);
        }
        else
        {
            Log.LogInfo("Skipping native Canvas.SendWillRenderCanvases detour canary because debug flag nativeCanvasDetourCanary is disabled.");
        }

        if (DebugConfig.IsEnabled("addComponent", defaultValue: false))
        {
            try
            {
                Log.LogInfo("Attempting BasePlugin.AddComponent<PackViewerDriver>() diagnostic.");
                AddComponent<PackViewerDriver>();
                Log.LogInfo("Installed PackViewer global Update driver through BasePlugin.AddComponent.");
            }
            catch (Exception ex)
            {
                Log.LogError($"Failed to install PackViewer global Update driver: {ex}");
            }
        }
        else
        {
            Log.LogInfo("Skipping BasePlugin.AddComponent<PackViewerDriver>() diagnostic because debug flag addComponent is disabled.");
        }

        if (DebugConfig.IsEnabled("harmony", defaultValue: true))
        {
            try
            {
                _harmony = new Harmony("sap.library.pack-viewer-in-versus");
                if (DebugConfig.IsEnabled("harmonySelfTest", defaultValue: true))
                {
                    HarmonySelfTest.InstallAndRun(_harmony, Log);
                }

                if (DebugConfig.IsEnabled("frameHeartbeat", defaultValue: false))
                {
                    FrameHeartbeatHook.Install(_harmony, Log);
                }

                BuildSceneUpdateHook.Install(_harmony, Log);
                Log.LogInfo("Installed build-scene update hooks for pack-viewer button.");
            }
            catch (Exception ex)
            {
                Log.LogError($"Failed to install pack-viewer UI hook: {ex}");
            }
        }
        else
        {
            Log.LogInfo("Skipping Harmony diagnostics because debug flag harmony is disabled.");
        }
    }
}

internal static class DebugConfig
{
    private static Dictionary<string, string> _values;

    public static bool IsEnabled(string key, bool defaultValue)
    {
        var env = Environment.GetEnvironmentVariable($"PV_DIAG_{key.ToUpperInvariant()}");
        if (TryParseBool(env, out var envValue))
        {
            return envValue;
        }

        if (Values.TryGetValue(key, out var raw) && TryParseBool(raw, out var fileValue))
        {
            return fileValue;
        }

        return defaultValue;
    }

    public static HashSet<string> GetCsv(string key)
    {
        var raw = Environment.GetEnvironmentVariable($"PV_DIAG_{key.ToUpperInvariant()}");
        if (string.IsNullOrWhiteSpace(raw))
        {
            Values.TryGetValue(key, out raw);
        }

        if (string.IsNullOrWhiteSpace(raw))
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }

        return raw.Split(',')
            .Select(value => value.Trim())
            .Where(value => value.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public static int GetInt(string key, int defaultValue)
    {
        var raw = Environment.GetEnvironmentVariable($"PV_DIAG_{key.ToUpperInvariant()}");
        if (string.IsNullOrWhiteSpace(raw))
        {
            Values.TryGetValue(key, out raw);
        }

        return int.TryParse(raw, out var parsed) ? parsed : defaultValue;
    }

    private static Dictionary<string, string> Values
    {
        get
        {
            if (_values != null)
            {
                return _values;
            }

            _values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var path = Path.Combine(Paths.ConfigPath, "PackViewerInVersus.debug");
            if (!File.Exists(path))
            {
                return _values;
            }

            foreach (var line in File.ReadAllLines(path))
            {
                var trimmed = line.Trim();
                if (trimmed.Length == 0 || trimmed.StartsWith("#", StringComparison.Ordinal))
                {
                    continue;
                }

                var equalsIndex = trimmed.IndexOf('=');
                if (equalsIndex <= 0)
                {
                    continue;
                }

                _values[trimmed[..equalsIndex].Trim()] = trimmed[(equalsIndex + 1)..].Trim();
            }

            return _values;
        }
    }

    private static bool TryParseBool(string raw, out bool value)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            value = false;
            return false;
        }

        if (raw.Equals("1", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("true", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("on", StringComparison.OrdinalIgnoreCase))
        {
            value = true;
            return true;
        }

        if (raw.Equals("0", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("false", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("no", StringComparison.OrdinalIgnoreCase) ||
            raw.Equals("off", StringComparison.OrdinalIgnoreCase))
        {
            value = false;
            return true;
        }

        value = false;
        return false;
    }
}

internal static class HarmonySelfTest
{
    private static bool _postfixFired;

    public static void InstallAndRun(Harmony harmony, BepInEx.Logging.ManualLogSource logger)
    {
        var getter = AccessTools.PropertyGetter(typeof(Application), nameof(Application.unityVersion));
        if (getter == null)
        {
            logger.LogWarning("PV Harmony self-test skipped: UnityEngine.Application.unityVersion getter was not found.");
            return;
        }

        harmony.Patch(getter, postfix: new HarmonyMethod(typeof(HarmonySelfTest), nameof(UnityVersionPostfix)));
        logger.LogInfo("PV Harmony self-test patched UnityEngine.Application.unityVersion getter.");

        var version = Application.unityVersion;
        logger.LogInfo($"PV Harmony self-test read Application.unityVersion='{version}' postfixFired={_postfixFired}.");
    }

    private static void UnityVersionPostfix(string __result)
    {
        _postfixFired = true;
        MainThreadUiTick.Logger?.LogInfo($"PV Harmony self-test postfix fired for Application.unityVersion='{__result}'.");
    }
}

internal static class FrameHeartbeatHook
{
    private static readonly object Context = new FrameHeartbeatContext();
    private static bool _loggedFirstPulse;

    public static void Install(Harmony harmony, BepInEx.Logging.ManualLogSource logger)
    {
        var getter = AccessTools.PropertyGetter(typeof(Time), nameof(Time.deltaTime));
        if (getter == null)
        {
            logger.LogWarning("PV frame heartbeat skipped: UnityEngine.Time.deltaTime getter was not found.");
            return;
        }

        harmony.Patch(getter, postfix: new HarmonyMethod(typeof(FrameHeartbeatHook), nameof(Postfix)));
        logger.LogInfo("PV frame heartbeat patched UnityEngine.Time.deltaTime getter.");
    }

    private static void Postfix()
    {
        if (!_loggedFirstPulse)
        {
            _loggedFirstPulse = true;
            MainThreadUiTick.Logger?.LogInfo($"PV frame heartbeat fired on managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'.");
        }

        MainThreadUiTick.Tick(Context);
    }

    private sealed class FrameHeartbeatContext
    {
    }
}

public sealed class PackViewerDriver : MonoBehaviour
{
    public PackViewerDriver(IntPtr ptr) : base(ptr)
    {
    }

    private void Update()
    {
        MainThreadUiTick.Tick(this);
    }
}

internal static class BuildSceneUpdateHook
{
    public static void Install(Harmony harmony, BepInEx.Logging.ManualLogSource logger)
    {
        var patched = 0;
        var allowList = DebugConfig.GetCsv("hookTargets");
        foreach (var target in GetHookTargets(logger))
        {
            if (allowList.Count > 0 && !allowList.Contains(target.Name))
            {
                logger.LogInfo($"Skipping {target.Type.FullName}.{target.MethodName}() because hook target '{target.Name}' is not enabled.");
                continue;
            }

            var method = AccessTools.Method(target.Type, target.MethodName);
            if (method == null)
            {
                logger.LogWarning($"Could not find {target.Type.FullName}.{target.MethodName}(); skipping pack-viewer hook target.");
                continue;
            }

            var postfix = new HarmonyMethod(typeof(BuildSceneUpdateHook), nameof(PostfixNoArgs));
            harmony.Patch(method, postfix: postfix);
            patched++;
            logger.LogInfo($"Patched {target.Type.FullName}.{target.MethodName}().");
        }

        if (patched == 0)
        {
            throw new InvalidOperationException("Could not patch any build-scene update methods.");
        }
    }

    private static IEnumerable<(string Name, Type Type, string MethodName)> GetHookTargets(BepInEx.Logging.ManualLogSource logger)
    {
        yield return ("menuStart", typeof(global::Spacewood.Unity.Menu), "Start");
        yield return ("buttonBaseUpdate", typeof(global::Spacewood.Unity.UI.ButtonBase), "Update");
        yield return ("playbackManagerUpdate", typeof(global::Spacewood.Unity.PlaybackManager), "Update");
        yield return ("productManagerUpdate", typeof(global::Spacewood.Unity.ProductManager), "Update");
        yield return ("playBoxUpdate", typeof(global::Spacewood.Unity.PlayBox), "Update");
        yield return ("loaderUpdate", typeof(global::Spacewood.Unity.Loader), "Update");
        yield return ("cursorControllerUpdate", typeof(global::Spacewood.Unity.CursorController), "Update");
        yield return ("mouseControllerUpdate", typeof(global::Spacewood.Unity.Mouse.MouseController), "Update");
        yield return ("packShopUpdate", typeof(global::Spacewood.Unity.PackShop), "Update");
        yield return ("hangarMainUpdate", typeof(global::Spacewood.Unity.MonoBehaviours.Build.HangarMain), "Update");
        yield return ("hangarTimerUpdate", typeof(global::Spacewood.Unity.MonoBehaviours.Build.HangarTimer), "Update");
    }

    private static Type FindType(string fullName)
    {
        var type = AccessTools.TypeByName(fullName);
        if (type != null)
        {
            return type;
        }

        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            type = assembly.GetType(fullName, throwOnError: false);
            if (type != null)
            {
                return type;
            }
        }

        var assemblyPath = Path.Combine(Paths.GameRootPath, "BepInEx", "interop", "Assembly-CSharp.dll");
        if (!File.Exists(assemblyPath))
        {
            return null;
        }

        var loadedAssembly = Assembly.LoadFrom(assemblyPath);
        return loadedAssembly.GetType(fullName, throwOnError: false);
    }

    private static void PostfixNoArgs()
    {
        LogPostfixOnce("parameterless");
        MainThreadUiTick.Tick(HookContext.Instance);
    }

    private static readonly HashSet<string> SeenPostfixContexts = new(StringComparer.Ordinal);

    private static void LogPostfixOnce(string typeName)
    {
        if (!SeenPostfixContexts.Add(typeName))
        {
            return;
        }

        MainThreadUiTick.Logger?.LogInfo($"PV Harmony postfix fired: context={typeName} managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'.");
    }

    private sealed class HookContext
    {
        public static readonly HookContext Instance = new();
    }
}
