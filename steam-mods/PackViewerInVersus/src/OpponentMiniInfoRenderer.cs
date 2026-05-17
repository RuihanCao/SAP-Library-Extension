using BepInEx.Logging;
using Spacewood.Core.Enums;
using UnityEngine;
using UnityEngine.UI;

namespace PackViewerInVersus;

internal static class OpponentMiniInfoRenderer
{
    private const string PanelName = "PackViewerInVersusMiniInfo";

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

            EnsurePanel(entry, FormatPack(pack, isCustom), lives, logger);
            rendered++;
        }

        if (rendered > 0 && now >= _nextLogAt)
        {
            _nextLogAt = now + 15f;
            logger.LogInfo($"PV mini scoreboard info rendered for {rendered} row(s).");
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

    private static void EnsurePanel(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        string packLabel,
        int lives,
        ManualLogSource logger)
    {
        var parent = entry.transform as RectTransform;
        if (parent == null)
        {
            return;
        }

        var panel = FindPanel(parent) ?? CreatePanel(parent, logger);
        var text = panel.GetComponentInChildren<Text>();
        if (text == null)
        {
            return;
        }

        text.text = $"Lives {lives}\n{packLabel}";
        panel.transform.SetAsLastSibling();
    }

    private static GameObject FindPanel(RectTransform parent)
    {
        for (var i = 0; i < parent.childCount; i++)
        {
            var child = parent.GetChild(i);
            if (child != null && child.name == PanelName)
            {
                return child.gameObject;
            }
        }

        return null;
    }

    private static GameObject CreatePanel(RectTransform parent, ManualLogSource logger)
    {
        var panel = new GameObject(PanelName);
        panel.transform.SetParent(parent, worldPositionStays: false);

        var rect = panel.AddComponent<RectTransform>();
        rect.anchorMin = new Vector2(0f, 1f);
        rect.anchorMax = new Vector2(0f, 1f);
        rect.pivot = new Vector2(0f, 1f);
        rect.anchoredPosition = new Vector2(20f, -18f);
        rect.sizeDelta = new Vector2(260f, 92f);

        var background = panel.AddComponent<Image>();
        background.color = new Color(0f, 0f, 0f, 0.42f);

        var textObject = new GameObject("Text");
        textObject.transform.SetParent(panel.transform, worldPositionStays: false);

        var textRect = textObject.AddComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.offsetMin = new Vector2(12f, 7f);
        textRect.offsetMax = new Vector2(-12f, -7f);

        var text = textObject.AddComponent<Text>();
        text.alignment = TextAnchor.MiddleLeft;
        text.color = Color.white;
        text.fontSize = 24;
        text.fontStyle = FontStyle.Bold;
        text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        text.horizontalOverflow = HorizontalWrapMode.Overflow;
        text.verticalOverflow = VerticalWrapMode.Truncate;

        logger.LogInfo($"PV installed mini scoreboard info under '{ReflectionUtils.GetHierarchyPath(parent.gameObject)}'.");
        return panel;
    }

    private static string FormatPack(Pack pack, bool isCustom)
    {
        if (isCustom)
        {
            return "Custom pack";
        }

        var raw = pack.ToString();
        if (string.IsNullOrWhiteSpace(raw))
        {
            return "Pack unknown";
        }

        return raw.EndsWith("Pack", StringComparison.OrdinalIgnoreCase)
            ? SplitWords(raw)
            : $"{SplitWords(raw)} pack";
    }

    private static string SplitWords(string value)
    {
        var chars = new List<char>(value.Length + 8);
        for (var i = 0; i < value.Length; i++)
        {
            var current = value[i];
            if (i > 0 && char.IsUpper(current) && !char.IsWhiteSpace(value[i - 1]))
            {
                chars.Add(' ');
            }

            chars.Add(current);
        }

        return new string(chars.ToArray());
    }
}
