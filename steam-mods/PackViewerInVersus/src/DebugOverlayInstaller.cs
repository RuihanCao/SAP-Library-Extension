using BepInEx.Logging;
using UnityEngine;
using UnityEngine.UI;

namespace PackViewerInVersus;

internal static class DebugOverlayInstaller
{
    private const string OverlayName = "PackViewerInVersusDebugOverlay";

    private static GameObject _overlayObject;
    private static Text _text;

    public static void EnsureInstalled(ManualLogSource logger)
    {
        if (HasOverlay)
        {
            return;
        }

        _overlayObject = null;
        _text = null;

        var existing = Resources.FindObjectsOfTypeAll<GameObject>()
            .FirstOrDefault(gameObject => gameObject != null
                && gameObject.name == OverlayName
                && gameObject.scene.IsValid());
        if (existing != null)
        {
            _overlayObject = existing;
            _text = existing.GetComponentInChildren<Text>();
            return;
        }

        var canvas = Resources.FindObjectsOfTypeAll<Canvas>()
            .Where(canvas => canvas != null && canvas.gameObject.activeInHierarchy && canvas.gameObject.scene.IsValid())
            .OrderByDescending(canvas => canvas.sortingOrder)
            .FirstOrDefault();
        if (canvas == null)
        {
            return;
        }

        _overlayObject = CreateOverlay(canvas);
        logger.LogInfo($"Installed Pack Viewer debug overlay under canvas '{ReflectionUtils.GetHierarchyPath(canvas.gameObject)}'.");
    }

    public static void UpdateText(string value)
    {
        if (!HasOverlay)
        {
            return;
        }

        _text.text = value;
    }

    private static bool HasOverlay => _overlayObject != null && _overlayObject && _text != null && _text;

    private static GameObject CreateOverlay(Canvas canvas)
    {
        var overlayObject = new GameObject(OverlayName);
        overlayObject.transform.SetParent(canvas.transform, worldPositionStays: false);

        var rectTransform = overlayObject.AddComponent<RectTransform>();
        rectTransform.anchorMin = new Vector2(0f, 1f);
        rectTransform.anchorMax = new Vector2(0f, 1f);
        rectTransform.pivot = new Vector2(0f, 1f);
        rectTransform.anchoredPosition = new Vector2(8f, -92f);
        rectTransform.sizeDelta = new Vector2(760f, 34f);

        var background = overlayObject.AddComponent<Image>();
        background.color = new Color(0f, 0f, 0f, 0.65f);

        var textObject = new GameObject("Text");
        textObject.transform.SetParent(overlayObject.transform, worldPositionStays: false);

        var textRect = textObject.AddComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.offsetMin = new Vector2(8f, 3f);
        textRect.offsetMax = new Vector2(-8f, -3f);

        _text = textObject.AddComponent<Text>();
        _text.text = "PV initializing";
        _text.alignment = TextAnchor.MiddleLeft;
        _text.color = Color.white;
        _text.fontSize = 18;
        _text.fontStyle = FontStyle.Bold;
        _text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        _text.horizontalOverflow = HorizontalWrapMode.Overflow;
        _text.verticalOverflow = VerticalWrapMode.Truncate;

        overlayObject.transform.SetAsLastSibling();
        return overlayObject;
    }
}
