using BepInEx.Logging;
using UnityEngine;
using UnityEngine.UI;

namespace PackViewerInVersus;

internal static class OverlayButtonInstaller
{
    private const string ButtonName = "PackViewerInVersusButton";

    internal static ManualLogSource Logger { get; set; }

    private static GameObject _buttonObject;
    private static RectTransform _buttonRect;
    private static Canvas _buttonCanvas;
    private static bool _warnedNoCanvas;

    public static bool HasButton => _buttonObject != null && _buttonObject && _buttonRect != null && _buttonRect;

    public static void EnsureInstalled(ManualLogSource logger)
    {
        Logger = logger;
        if (HasButton)
        {
            return;
        }

        _buttonObject = null;
        _buttonRect = null;
        _buttonCanvas = null;

        var existing = Resources.FindObjectsOfTypeAll<GameObject>()
            .FirstOrDefault(gameObject => gameObject != null
                && gameObject.name == ButtonName
                && gameObject.scene.IsValid());
        if (existing != null)
        {
            _buttonObject = existing;
            _buttonRect = existing.GetComponent<RectTransform>();
            _buttonCanvas = existing.GetComponentInParent<Canvas>();
            return;
        }

        var canvas = FindBestCanvas();
        if (canvas == null)
        {
            if (!_warnedNoCanvas)
            {
                _warnedNoCanvas = true;
                logger.LogWarning("Could not install pack viewer button because no active Canvas was found.");
            }

            return;
        }

        _buttonObject = CreateButton(canvas, logger);
        _buttonCanvas = canvas;
        logger.LogInfo($"Installed Pack Viewer button under canvas '{ReflectionUtils.GetHierarchyPath(canvas.gameObject)}': {GetDiagnostics()}");
    }

    public static void ResetIfDestroyed()
    {
        if (_buttonObject == null || !_buttonObject || _buttonRect == null || !_buttonRect)
        {
            _buttonObject = null;
            _buttonRect = null;
            _buttonCanvas = null;
        }
    }

    public static bool ContainsScreenPoint(Vector3 screenPoint)
    {
        return HasButton && RectTransformUtility.RectangleContainsScreenPoint(_buttonRect, screenPoint, GetEventCamera());
    }

    public static string GetShortStatus()
    {
        return HasButton ? "yes" : "no";
    }

    public static string GetDiagnostics()
    {
        if (!HasButton)
        {
            return "buttonPresent=false";
        }

        var canvasPath = _buttonCanvas != null && _buttonCanvas
            ? ReflectionUtils.GetHierarchyPath(_buttonCanvas.gameObject)
            : "<unknown>";
        var corners = new Vector3[4];
        _buttonRect.GetWorldCorners(corners);
        var camera = GetEventCamera();
        var bottomLeft = RectTransformUtility.WorldToScreenPoint(camera, corners[0]);
        var topRight = RectTransformUtility.WorldToScreenPoint(camera, corners[2]);

        return $"buttonPresent=true canvas='{canvasPath}' renderMode={_buttonCanvas?.renderMode.ToString() ?? "<unknown>"} sorting={_buttonCanvas?.sortingOrder.ToString() ?? "<unknown>"} anchored=({_buttonRect.anchoredPosition.x:0},{_buttonRect.anchoredPosition.y:0}) size=({_buttonRect.rect.width:0},{_buttonRect.rect.height:0}) screenRect=({bottomLeft.x:0},{bottomLeft.y:0})-({topRight.x:0},{topRight.y:0})";
    }

    private static Canvas FindBestCanvas()
    {
        return Resources.FindObjectsOfTypeAll<Canvas>()
            .Where(canvas => canvas != null && canvas.gameObject.activeInHierarchy && canvas.gameObject.scene.IsValid())
            .Select(canvas => new { Canvas = canvas, Path = ReflectionUtils.GetHierarchyPath(canvas.gameObject) })
            .Where(item => !item.Path.Contains("Quantum Console", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => ScoreCanvas(item.Canvas, item.Path))
            .Select(item => item.Canvas)
            .FirstOrDefault();
    }

    private static int ScoreCanvas(Canvas canvas, string path)
    {
        var score = canvas.sortingOrder;
        if (path.Contains("Hangar/Overlay/TopRightCanvas", StringComparison.OrdinalIgnoreCase))
        {
            score += 10000;
        }
        else if (path.Contains("TopRightCanvas", StringComparison.OrdinalIgnoreCase))
        {
            score += 8000;
        }
        else if (path.Contains("Overlay", StringComparison.OrdinalIgnoreCase))
        {
            score += 3000;
        }

        if (canvas.renderMode == RenderMode.ScreenSpaceOverlay)
        {
            score += 500;
        }

        return score;
    }

    private static Camera GetEventCamera()
    {
        if (_buttonCanvas == null || !_buttonCanvas || _buttonCanvas.renderMode == RenderMode.ScreenSpaceOverlay)
        {
            return null;
        }

        return _buttonCanvas.worldCamera;
    }

    private static GameObject CreateButton(Canvas canvas, ManualLogSource logger)
    {
        var buttonObject = new GameObject(ButtonName);
        buttonObject.transform.SetParent(canvas.transform, worldPositionStays: false);

        var rectTransform = buttonObject.AddComponent<RectTransform>();
        _buttonRect = rectTransform;
        rectTransform.anchorMin = new Vector2(1f, 1f);
        rectTransform.anchorMax = new Vector2(1f, 1f);
        rectTransform.pivot = new Vector2(1f, 1f);
        rectTransform.sizeDelta = new Vector2(78f, 78f);
        rectTransform.anchoredPosition = new Vector2(-250f, -16f);

        var border = buttonObject.AddComponent<Image>();
        border.color = Color.black;

        var innerObject = new GameObject("Inner");
        innerObject.transform.SetParent(buttonObject.transform, worldPositionStays: false);

        var innerRect = innerObject.AddComponent<RectTransform>();
        innerRect.anchorMin = Vector2.zero;
        innerRect.anchorMax = Vector2.one;
        innerRect.offsetMin = new Vector2(6f, 6f);
        innerRect.offsetMax = new Vector2(-6f, -6f);

        var image = innerObject.AddComponent<Image>();
        image.color = new Color(1f, 0.42f, 0f, 1f);

        var textObject = new GameObject("Label");
        textObject.transform.SetParent(innerObject.transform, worldPositionStays: false);

        var textRect = textObject.AddComponent<RectTransform>();
        textRect.anchorMin = Vector2.zero;
        textRect.anchorMax = Vector2.one;
        textRect.offsetMin = Vector2.zero;
        textRect.offsetMax = Vector2.zero;

        var text = textObject.AddComponent<Text>();
        text.text = "?";
        text.alignment = TextAnchor.MiddleCenter;
        text.color = new Color(0.2f, 0.08f, 0f, 1f);
        text.fontSize = 54;
        text.fontStyle = FontStyle.Bold;
        text.font = Resources.GetBuiltinResource<Font>("Arial.ttf");

        buttonObject.transform.SetAsLastSibling();

        return buttonObject;
    }
}
