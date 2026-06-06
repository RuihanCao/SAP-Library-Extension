using System.Threading;
using System.Reflection;
using System.Diagnostics;
using System;
using BepInEx.Preloader.Core.Patching;
using BepInEx.Unity.IL2CPP;

namespace SapBepInExChainloaderKick;

[PatcherPluginInfo("sap.library.bepinex.chainloader-kick", "SAP BepInEx Chainloader Kick", "0.1.0")]
public sealed class ChainloaderKickPatcher : BasePatcher
{
    public override void Finalizer()
    {
        Log.LogInfo($"Finalizer on managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}' pid={Environment.ProcessId}.");

        if (GetBoolEnv("SAP_CHAINLOADER_KICK_DISABLED", defaultValue: false))
        {
            Log.LogInfo("IL2CPP chainloader execute fallback disabled by SAP_CHAINLOADER_KICK_DISABLED.");
            return;
        }

        Log.LogInfo(
            "Scheduling IL2CPP chainloader execute fallback " +
            $"delayMs={GetIntEnv("SAP_CHAINLOADER_KICK_DELAY_MS", 1000)} " +
            $"pollMs={GetIntEnv("SAP_CHAINLOADER_KICK_POLL_MS", 500)} " +
            $"maxAttempts={GetIntEnv("SAP_CHAINLOADER_KICK_MAX_ATTEMPTS", 120)}.");

        var thread = new Thread(RunFallback)
        {
            IsBackground = true,
            Name = "SAP BepInEx Chainloader Kick"
        };
        thread.Start();
    }

    private void RunFallback()
    {
        try
        {
            var stopwatch = Stopwatch.StartNew();
            var delayMs = GetIntEnv("SAP_CHAINLOADER_KICK_DELAY_MS", 1000);
            var pollMs = GetIntEnv("SAP_CHAINLOADER_KICK_POLL_MS", 500);
            var maxAttempts = GetIntEnv("SAP_CHAINLOADER_KICK_MAX_ATTEMPTS", 120);

            Log.LogInfo($"Fallback thread started managedThread={Environment.CurrentManagedThreadId} name='{Thread.CurrentThread.Name ?? "<unnamed>"}'.");

            for (var attempt = 0; attempt < maxAttempts; attempt++)
            {
                var chainloader = IL2CPPChainloader.Instance ?? GetPreloaderChainloader();
                if (chainloader != null)
                {
                    Log.LogInfo($"Found IL2CPPChainloader on attempt={attempt + 1} elapsedMs={stopwatch.ElapsedMilliseconds}; sleeping delayMs={delayMs} before fallback Execute().");
                    Thread.Sleep(delayMs);
                    Log.LogInfo($"Forcing IL2CPP chainloader Execute() on managedThread={Environment.CurrentManagedThreadId} elapsedMs={stopwatch.ElapsedMilliseconds}.");
                    chainloader.Execute();
                    Log.LogInfo($"IL2CPP chainloader Execute() returned elapsedMs={stopwatch.ElapsedMilliseconds}.");
                    return;
                }

                if (attempt == 0 || (attempt + 1) % 10 == 0)
                {
                    Log.LogInfo($"Waiting for IL2CPPChainloader.Instance attempt={attempt + 1} elapsedMs={stopwatch.ElapsedMilliseconds}.");
                }

                Thread.Sleep(pollMs);
            }

            Log.LogWarning("Timed out waiting for IL2CPPChainloader.Instance.");
        }
        catch (System.Exception ex)
        {
            Log.LogError($"Fallback thread failed: {ex}");
        }
    }

    private static IL2CPPChainloader? GetPreloaderChainloader()
    {
        var property = typeof(BepInEx.Unity.IL2CPP.Preloader).GetProperty(
            "Chainloader",
            BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
        return property?.GetValue(null) as IL2CPPChainloader;
    }

    private static int GetIntEnv(string name, int defaultValue)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        return int.TryParse(raw, out var parsed) && parsed >= 0 ? parsed : defaultValue;
    }

    private static bool GetBoolEnv(string name, bool defaultValue)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(raw))
        {
            return defaultValue;
        }

        return raw.Equals("1", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("true", StringComparison.OrdinalIgnoreCase)
            || raw.Equals("yes", StringComparison.OrdinalIgnoreCase);
    }
}
