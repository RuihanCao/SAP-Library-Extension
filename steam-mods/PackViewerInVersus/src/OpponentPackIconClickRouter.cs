using BepInEx.Logging;
using UnityEngine;

namespace PackViewerInVersus;

internal static class OpponentPackIconClickRouter
{
    public static bool TryHandleClick(Vector3 screenPoint, ManualLogSource logger)
    {
        var entries = Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry>()
            .Where(entry => entry != null && entry.gameObject != null && entry.gameObject.scene.IsValid())
            .Where(entry => entry.gameObject.activeInHierarchy)
            .OrderByDescending(entry => ReflectionUtils.GetHierarchyPath(entry.gameObject).Contains("/Scoreboard/", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        foreach (var entry in entries)
        {
            if (!ContainsPackIcon(entry, screenPoint, out var hitName))
            {
                continue;
            }

            logger.LogInfo($"Scoreboard pack icon clicked: hit={hitName} entry={ReflectionUtils.GetHierarchyPath(entry.gameObject)} screen=({screenPoint.x:0},{screenPoint.y:0}).");
            return PackViewerLauncher.TryOpenFromScoreboardEntry(entry, logger);
        }

        return false;
    }

    private static bool ContainsPackIcon(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        Vector3 screenPoint,
        out string hitName)
    {
        foreach (var rect in GetPackIconRects(entry))
        {
            if (rect == null || !rect || rect.gameObject == null || !rect.gameObject.activeInHierarchy)
            {
                continue;
            }

            var canvas = rect.GetComponentInParent<Canvas>();
            var camera = canvas != null && canvas.renderMode != RenderMode.ScreenSpaceOverlay ? canvas.worldCamera : null;
            if (!RectTransformUtility.RectangleContainsScreenPoint(rect, screenPoint, camera))
            {
                continue;
            }

            hitName = $"{rect.name} path='{ReflectionUtils.GetHierarchyPath(rect.gameObject)}'";
            return true;
        }

        hitName = "<none>";
        return false;
    }

    private static IEnumerable<RectTransform> GetPackIconRects(global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry)
    {
        yield return entry.PackContainer;
        yield return entry.PackStandard;
        yield return entry.PackCustom;
        yield return entry.PackChallenge;
        if (entry.PackStandardImage != null)
        {
            yield return entry.PackStandardImage.rectTransform;
        }
    }
}
