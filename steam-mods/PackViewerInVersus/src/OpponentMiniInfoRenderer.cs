using BepInEx.Logging;
using Spacewood.Core.Enums;
using System.Reflection;
using UnityEngine;

namespace PackViewerInVersus;

internal static class OpponentMiniInfoRenderer
{
    private const BindingFlags InstanceFlags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    private static float _nextScanAt;
    private static float _nextLogAt;

    public static void EnsureRendered(ManualLogSource logger)
    {
        var now = Time.realtimeSinceStartup;
        if (now < _nextScanAt)
        {
            return;
        }

        _nextScanAt = now + 0.25f;

        var rendered = 0;
        foreach (var entry in GetMiniEntries())
        {
            if (!TryReadOpponent(entry, out var pack, out var lives, out var isCustom))
            {
                continue;
            }

            if (EnsureNativeMiniInfo(entry, pack, lives, isCustom, logger))
            {
                rendered++;
            }
        }

        if (rendered > 0 && now >= _nextLogAt)
        {
            _nextLogAt = now + 15f;
            logger.LogInfo($"PV mini scoreboard native pack/lives UI rendered for {rendered} row(s).");
        }
    }

    private static IEnumerable<global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry> GetMiniEntries()
    {
        return Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry>()
            .Where(entry => entry != null && entry.gameObject != null && entry.gameObject.scene.IsValid())
            .Where(entry => entry.gameObject.activeInHierarchy)
            .Where(IsMiniEntry);
    }

    private static bool IsMiniEntry(global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry)
    {
        var path = ReflectionUtils.GetHierarchyPath(entry.gameObject);
        return path.Contains("ScoreboardMini", StringComparison.OrdinalIgnoreCase)
            || path.Contains("MiniScoreboard", StringComparison.OrdinalIgnoreCase)
            || path.Contains("Mini", StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryReadOpponent(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        out Pack pack,
        out int lives,
        out bool isCustom)
    {
        pack = default;
        lives = 0;
        isCustom = false;

        try
        {
            var opponent = entry.Opponent;
            if (opponent == null)
            {
                return false;
            }

            pack = opponent.Pack;
            lives = opponent.Lives;
            isCustom = opponent.WildPack;
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool EnsureNativeMiniInfo(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        Pack pack,
        int lives,
        bool isCustom,
        ManualLogSource logger)
    {
        try
        {
            TrySetLives(entry, lives);

            var showedPack = ShowPackUi(entry, pack, isCustom);
            var livesLabel = TryGetComponentProperty(entry, "LivesLabel");
            var showedLives = ShowLivesUi(livesLabel);
            if (!showedPack && !showedLives)
            {
                return false;
            }

            if (showedPack)
            {
                MovePackUi(entry);
            }

            if (showedLives)
            {
                MoveLivesUi(livesLabel);
            }

            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"PV mini native UI render failed for {ReflectionUtils.GetHierarchyPath(entry.gameObject)}: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static bool ShowPackUi(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        Pack pack,
        bool isCustom)
    {
        var shown = false;
        shown |= SetActive(entry.PackContainer, true);

        if (isCustom)
        {
            shown |= SetActive(entry.PackCustom, true);
            SetActive(entry.PackStandard, false);
            SetActive(entry.PackChallenge, false);
        }
        else
        {
            shown |= SetActive(entry.PackStandard, true);
            SetActive(entry.PackCustom, false);
            SetActive(entry.PackChallenge, false);
        }

        // The game's own SetModel usually has already assigned the right sprite.
        // Keep the native Image component and only force the relevant container visible.
        _ = pack;
        return shown;
    }

    private static bool ShowLivesUi(Component livesLabel)
    {
        return SetActive(livesLabel, true);
    }

    private static void MovePackUi(global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry)
    {
        var rect = entry.PackContainer;
        if (rect == null || !rect)
        {
            rect = entry.PackStandard != null && entry.PackStandard ? entry.PackStandard : entry.PackCustom;
        }

        if (rect == null || !rect)
        {
            return;
        }

        rect.anchorMin = new Vector2(0f, 0.5f);
        rect.anchorMax = new Vector2(0f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.anchoredPosition = new Vector2(78f, 0f);
        rect.sizeDelta = new Vector2(108f, 108f);
        rect.localScale = Vector3.one;
        rect.SetAsLastSibling();
    }

    private static void MoveLivesUi(Component livesLabel)
    {
        if (livesLabel == null || !livesLabel)
        {
            return;
        }

        var rect = livesLabel.transform as RectTransform;
        if (rect == null || !rect)
        {
            return;
        }

        rect.anchorMin = new Vector2(1f, 0.5f);
        rect.anchorMax = new Vector2(1f, 0.5f);
        rect.pivot = new Vector2(0.5f, 0.5f);
        rect.anchoredPosition = new Vector2(-80f, 0f);
        rect.sizeDelta = new Vector2(116f, 116f);
        rect.localScale = Vector3.one;
        rect.SetAsLastSibling();
    }

    private static void TrySetLives(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        int lives)
    {
        try
        {
            entry.Lives = lives;
        }
        catch
        {
            var property = entry.GetType().GetProperty("Lives", InstanceFlags);
            if (property?.CanWrite == true)
            {
                property.SetValue(entry, lives);
            }
        }
    }

    private static Component TryGetComponentProperty(object target, string propertyName)
    {
        try
        {
            return target
                ?.GetType()
                .GetProperty(propertyName, InstanceFlags)
                ?.GetValue(target) as Component;
        }
        catch
        {
            return null;
        }
    }

    private static bool SetActive(Component component, bool active)
    {
        return component != null && component.gameObject != null && SetActive(component.gameObject, active);
    }

    private static bool SetActive(GameObject gameObject, bool active)
    {
        if (gameObject == null)
        {
            return false;
        }

        if (gameObject.activeSelf != active)
        {
            gameObject.SetActive(active);
        }

        return gameObject.activeInHierarchy || active;
    }
}
