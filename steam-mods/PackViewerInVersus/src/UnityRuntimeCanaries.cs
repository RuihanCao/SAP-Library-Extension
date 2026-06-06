using BepInEx.Logging;
using BepInEx;
using BepInEx.Unity.IL2CPP;
using Il2CppInterop.Runtime;
using Il2CppInterop.Runtime.Injection;
using MonoMod.RuntimeDetour;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace PackViewerInVersus;

internal static class UnityRuntimeCanaries
{
    private static bool _canvasCanaryInstalled;
    private static bool _canvasCanaryLogged;
    private static bool _nativeCanvasDetourInstalled;
    private static bool _nativeCanvasDetourLogged;
    private static int _canvasTickCount;
    private static int _nativeCanvasDetourTickCount;
    private static float _nextCanvasStatusAt;
    private static float _nextNativeCanvasStatusAt;
    private static ManualLogSource _logger;
    private static NativeDetour _nativeCanvasDetour;
    private static NativeVoidDelegate _nativeCanvasOriginal;
    private static readonly NativeVoidDelegate NativeCanvasHookDelegate = NativeCanvasWillRenderHook;

    public static void InstallCanvasWillRenderCanary(ManualLogSource logger)
    {
        _logger = logger;
        if (_canvasCanaryInstalled)
        {
            logger.LogInfo("PV canvas canary already installed.");
            return;
        }

        var delayMs = DebugConfig.GetInt("canvasSubscribeDelayMs", 0);
        if (delayMs > 0)
        {
            _canvasCanaryInstalled = true;
            logger.LogInfo($"PV canvas canary scheduling delayed subscription delayMs={delayMs} from managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'.");
            var thread = new Thread(() =>
            {
                Thread.Sleep(delayMs);
                SubscribeCanvasWillRenderCanary(logger);
            })
            {
                IsBackground = true,
                Name = "PV Canvas Canary Delay"
            };
            thread.Start();
            return;
        }

        SubscribeCanvasWillRenderCanary(logger);
    }

    private static void SubscribeCanvasWillRenderCanary(ManualLogSource logger)
    {
        try
        {
            var callback = DelegateSupport.ConvertDelegate<Canvas.WillRenderCanvases>((Action)OnWillRenderCanvases);
            Canvas.add_willRenderCanvases(callback);
            _canvasCanaryInstalled = true;
            logger.LogInfo($"PV canvas canary subscribed to Canvas.willRenderCanvases from managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'.");
        }
        catch (Exception ex)
        {
            logger.LogError($"PV canvas canary subscription failed: {ex}");
        }
    }

    public static void RunClassInjectionCanary(ManualLogSource logger)
    {
        try
        {
            LogModuleCandidates(logger);
            logger.LogInfo("PV class-injection canary: registering PackViewerCanaryBehaviour with Il2Cpp ClassInjector.");
            ClassInjector.RegisterTypeInIl2Cpp<PackViewerCanaryBehaviour>();
            logger.LogInfo("PV class-injection canary succeeded.");
        }
        catch (Exception ex)
        {
            logger.LogError($"PV class-injection canary failed: {ex}");
        }
    }

    private static void LogModuleCandidates(ManualLogSource logger)
    {
        try
        {
            var process = Process.GetCurrentProcess();
            logger.LogInfo($"PV process main module: {process.MainModule?.ModuleName ?? "<null>"} => {process.MainModule?.FileName ?? "<null>"}");
            logger.LogInfo($"PV process module count: {process.Modules.Count}");
            var modules = Process.GetCurrentProcess()
                .Modules
                .Cast<ProcessModule>()
                .Select(module => $"{module.ModuleName} => {module.FileName}")
                .Where(value =>
                    value.Contains("Assembly", StringComparison.OrdinalIgnoreCase) ||
                    value.Contains("Unity", StringComparison.OrdinalIgnoreCase) ||
                    value.Contains("Super Auto Pets", StringComparison.OrdinalIgnoreCase))
                .Take(40)
                .ToArray();

            foreach (var module in modules)
            {
                logger.LogInfo($"PV module candidate: {module}");
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning($"PV module candidate logging failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    public static void RunNativeLibraryCanary(ManualLogSource logger)
    {
        try
        {
            var gameRoot = Paths.GameRootPath;
            var absolutePath = Path.Combine(
                gameRoot,
                "Super Auto Pets.app",
                "Contents",
                "Frameworks",
                "GameAssembly.dylib");

            logger.LogInfo($"PV native library canary: gameRoot='{gameRoot}' absoluteGameAssembly='{absolutePath}' exists={File.Exists(absolutePath)}.");
            TryLoadAndExport(logger, "GameAssembly", useAssemblySearch: true);
            TryLoadAndExport(logger, absolutePath, useAssemblySearch: false);
        }
        catch (Exception ex)
        {
            logger.LogError($"PV native library canary failed: {ex}");
        }
    }

    private static void TryLoadAndExport(ManualLogSource logger, string libraryNameOrPath, bool useAssemblySearch)
    {
        try
        {
            var handle = useAssemblySearch
                ? NativeLibrary.Load(libraryNameOrPath, typeof(UnityRuntimeCanaries).Assembly, null)
                : NativeLibrary.Load(libraryNameOrPath);
            var hasExport = NativeLibrary.TryGetExport(handle, "il2cpp_class_has_references", out var export);
            logger.LogInfo($"PV native library canary: Load('{libraryNameOrPath}') handle=0x{handle.ToInt64():x} il2cpp_class_has_references={hasExport} export=0x{export.ToInt64():x}.");
        }
        catch (Exception ex)
        {
            logger.LogWarning($"PV native library canary: Load('{libraryNameOrPath}') failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    public static void RunAddUnityComponentCanary(ManualLogSource logger)
    {
        try
        {
            logger.LogInfo("PV AddUnityComponent canary: adding PackViewerCanaryBehaviour through IL2CPPChainloader.Instance.");
            IL2CPPChainloader.AddUnityComponent(typeof(PackViewerCanaryBehaviour));
            logger.LogInfo("PV AddUnityComponent canary succeeded.");
        }
        catch (Exception ex)
        {
            logger.LogError($"PV AddUnityComponent canary failed: {ex}");
        }
    }

    public static void InstallNativeCanvasDetourCanary(ManualLogSource logger)
    {
        _logger = logger;
        if (_nativeCanvasDetourInstalled)
        {
            logger.LogInfo("PV native canvas detour canary already installed.");
            return;
        }

        try
        {
            var methodInfoPtr = GetNativeMethodInfoPointer(
                typeof(Canvas),
                "NativeMethodInfoPtr_SendWillRenderCanvases_Private_Static_Void_0");
            var methodPointer = methodInfoPtr == IntPtr.Zero ? IntPtr.Zero : Marshal.ReadIntPtr(methodInfoPtr);
            logger.LogInfo($"PV native canvas detour canary: methodInfo=0x{methodInfoPtr.ToInt64():x} methodPointer=0x{methodPointer.ToInt64():x}.");

            if (methodPointer == IntPtr.Zero)
            {
                logger.LogWarning("PV native canvas detour canary skipped because method pointer is zero.");
                return;
            }

            _nativeCanvasDetour = new NativeDetour(methodPointer, NativeCanvasHookDelegate);
            _nativeCanvasOriginal = _nativeCanvasDetour.GenerateTrampoline<NativeVoidDelegate>();
            if (!_nativeCanvasDetour.IsApplied)
            {
                _nativeCanvasDetour.Apply();
            }

            _nativeCanvasDetourInstalled = true;
            logger.LogInfo($"PV native canvas detour canary installed from managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}' applied={_nativeCanvasDetour.IsApplied}.");
        }
        catch (Exception ex)
        {
            logger.LogError($"PV native canvas detour canary failed: {ex}");
        }
    }

    private static void OnWillRenderCanvases()
    {
        try
        {
            _canvasTickCount++;
            if (!_canvasCanaryLogged)
            {
                _canvasCanaryLogged = true;
                _logger?.LogInfo($"PV canvas canary fired: managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}' scene='{GetSceneName()}' frame={Time.frameCount} realtime={Time.realtimeSinceStartup:0.00}.");
            }

            var now = Time.realtimeSinceStartup;
            if (now >= _nextCanvasStatusAt)
            {
                _nextCanvasStatusAt = now + 10f;
                _logger?.LogInfo($"PV canvas canary status: ticks={_canvasTickCount} scene='{GetSceneName()}' frame={Time.frameCount} realtime={now:0.00}.");
            }

            if (DebugConfig.IsEnabled("canvasTick", defaultValue: false))
            {
                MainThreadUiTick.Tick(CanvasHookContext.Instance);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogWarning($"PV canvas canary callback failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private static void NativeCanvasWillRenderHook()
    {
        try
        {
            _nativeCanvasDetourTickCount++;
            if (!_nativeCanvasDetourLogged)
            {
                _nativeCanvasDetourLogged = true;
                _logger?.LogInfo($"PV native canvas detour fired: managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}' scene='{GetSceneName()}' frame={Time.frameCount} realtime={Time.realtimeSinceStartup:0.00}.");
            }

            var now = Time.realtimeSinceStartup;
            if (now >= _nextNativeCanvasStatusAt)
            {
                _nextNativeCanvasStatusAt = now + 10f;
                _logger?.LogInfo($"PV native canvas detour status: ticks={_nativeCanvasDetourTickCount} scene='{GetSceneName()}' frame={Time.frameCount} realtime={now:0.00}.");
            }

            if (DebugConfig.IsEnabled("nativeCanvasTick", defaultValue: false))
            {
                MainThreadUiTick.Tick(NativeCanvasHookContext.Instance);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogWarning($"PV native canvas detour callback failed: {ex.GetType().Name}: {ex.Message}");
        }
        finally
        {
            _nativeCanvasOriginal?.Invoke();
        }
    }

    private static IntPtr GetNativeMethodInfoPointer(Type type, string fieldName)
    {
        var field = type.GetField(fieldName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
        if (field == null)
        {
            _logger?.LogWarning($"PV native canary could not find field {type.FullName}.{fieldName}.");
            return IntPtr.Zero;
        }

        var value = field.GetValue(null);
        return value is IntPtr ptr ? ptr : IntPtr.Zero;
    }

    private static string GetSceneName()
    {
        var scene = SceneManager.GetActiveScene();
        return scene.IsValid() ? scene.name ?? "<unnamed>" : "<invalid>";
    }

    private sealed class CanvasHookContext
    {
        public static readonly CanvasHookContext Instance = new();
    }

    private sealed class NativeCanvasHookContext
    {
        public static readonly NativeCanvasHookContext Instance = new();
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate void NativeVoidDelegate();
}

public sealed class PackViewerCanaryBehaviour : MonoBehaviour
{
    public PackViewerCanaryBehaviour(IntPtr ptr) : base(ptr)
    {
    }

    private void Awake()
    {
        MainThreadUiTick.Logger?.LogInfo($"PV canary behaviour Awake on managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'.");
    }

    private void Update()
    {
        MainThreadUiTick.Logger?.LogInfo($"PV canary behaviour Update on managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}' frame={Time.frameCount}.");
        MainThreadUiTick.Tick(this);
        enabled = false;
    }
}
