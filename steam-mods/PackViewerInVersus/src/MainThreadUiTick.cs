using BepInEx.Logging;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace PackViewerInVersus;

internal static class MainThreadUiTick
{
    internal static ManualLogSource Logger { get; set; }

    private static readonly HashSet<string> SeenHookContexts = new(StringComparer.Ordinal);
    private static float _nextInstallAt;
    private static float _nextStatusLogAt;
    private static float _nextOverlayUpdateAt;
    private static float _lastClickAt;
    private static int _lastProcessedFrame = -1;

    public static void Tick(object hookContext)
    {
        try
        {
            var frame = Time.frameCount;
            if (_lastProcessedFrame == frame)
            {
                return;
            }

            _lastProcessedFrame = frame;
            var now = Time.realtimeSinceStartup;
            LogHookContextOnce(hookContext);
            OverlayButtonInstaller.ResetIfDestroyed();
            OpponentMiniInfoRenderer.EnsureRendered(Logger);

            if (DebugConfig.IsEnabled("floatingButton", defaultValue: false) && now >= _nextInstallAt)
            {
                _nextInstallAt = now + 0.5f;
                OverlayButtonInstaller.EnsureInstalled(Logger);
            }

            if (DebugConfig.IsEnabled("debugOverlay", defaultValue: false) && now >= _nextOverlayUpdateAt)
            {
                _nextOverlayUpdateAt = now + 0.25f;
                DebugOverlayInstaller.EnsureInstalled(Logger);
                DebugOverlayInstaller.UpdateText(BuildShortStatus(hookContext));
            }

            if (now >= _nextStatusLogAt)
            {
                _nextStatusLogAt = now + 10f;
                Logger.LogInfo($"PV status: {BuildLongStatus(hookContext)}");
            }

            if (Input.GetKeyDown(KeyCode.F8))
            {
                Logger.LogInfo("PV F8 diagnostics requested.");
                LogDiagnostics(hookContext);
            }

            if (Input.GetKeyDown(KeyCode.F7))
            {
                Logger.LogInfo("PV F7 open requested.");
                PackViewerLauncher.TryOpenFromHangarMain(hookContext, Logger);
            }

            if (!Input.GetMouseButtonDown(0))
            {
                return;
            }

            var mousePosition = Input.mousePosition;
            if (now - _lastClickAt >= 0.5f && OpponentPackIconClickRouter.TryHandleClick(mousePosition, Logger))
            {
                _lastClickAt = now;
                return;
            }

            var containsButton = OverlayButtonInstaller.ContainsScreenPoint(mousePosition);
            Logger.LogInfo($"PV mouse down: screen=({mousePosition.x:0},{mousePosition.y:0}) buttonPresent={OverlayButtonInstaller.HasButton} containsButton={containsButton}");

            if (!OverlayButtonInstaller.HasButton || now - _lastClickAt < 0.5f || !containsButton)
            {
                return;
            }

            _lastClickAt = now;
            Logger.LogInfo("Pack Viewer overlay button clicked.");
            PackViewerLauncher.TryOpenFromHangarMain(hookContext, Logger);
        }
        catch (Exception ex)
        {
            Logger?.LogWarning($"Pack-viewer UI tick failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    private static void LogHookContextOnce(object hookContext)
    {
        var hookName = hookContext?.GetType().FullName ?? "<null>";
        if (!SeenHookContexts.Add(hookName))
        {
            return;
        }

        Logger.LogInfo($"PV hook fired: context={hookName} scene='{GetSceneName()}'");
    }

    private static void LogDiagnostics(object hookContext)
    {
        Logger.LogInfo($"PV diagnostics: {BuildLongStatus(hookContext)}");
        foreach (var line in DiagnosticsUtility.GetCanvasDiagnostics())
        {
            Logger.LogInfo($"PV canvas: {line}");
        }

        foreach (var line in DiagnosticsUtility.GetObjectDiagnostics())
        {
            Logger.LogInfo($"PV object: {line}");
        }
    }

    private static string BuildShortStatus(object hookContext)
    {
        return $"PV {GetSceneName()} | hook {GetShortTypeName(hookContext)} | icon click | F7 opp pack F8 dump";
    }

    private static string BuildLongStatus(object hookContext)
    {
        return $"scene='{GetSceneName()}' hook={hookContext?.GetType().FullName ?? "<null>"} {OverlayButtonInstaller.GetDiagnostics()}";
    }

    private static string GetSceneName()
    {
        var scene = SceneManager.GetActiveScene();
        return scene.IsValid() ? scene.name ?? "<unnamed>" : "<invalid>";
    }

    private static string GetShortTypeName(object value)
    {
        var name = value?.GetType().Name;
        return string.IsNullOrWhiteSpace(name) ? "<none>" : name;
    }
}
