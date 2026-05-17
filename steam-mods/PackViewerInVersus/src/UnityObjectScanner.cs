using UnityEngine;

namespace PackViewerInVersus;

internal static class UnityObjectScanner
{
    private static readonly string[] StrongTerms =
    {
        "pack",
        "library",
        "collection",
        "custom",
        "exclusive",
        "achievements",
        "achievement"
    };

    private static readonly string[] ContextTerms =
    {
        "versus",
        "shop",
        "button",
        "popup",
        "modal",
        "screen",
        "menu",
        "unicorn",
        "turtle",
        "golden",
        "pets",
        "food"
    };

    public static IReadOnlyList<SearchHit> FindPackViewerCandidates(int maxHits)
    {
        var hits = new List<SearchHit>();
        var objects = Resources.FindObjectsOfTypeAll<GameObject>();

        foreach (var gameObject in objects)
        {
            if (!IsRuntimeObject(gameObject))
            {
                continue;
            }

            var components = gameObject.GetComponents<Component>().Where(component => component != null).ToArray();
            var componentNames = components.Select(component => component.GetType().FullName ?? component.GetType().Name).ToArray();
            var visibleText = string.Join(" | ", components.Select(ReflectionUtils.GetVisibleText).Where(text => !string.IsNullOrWhiteSpace(text)));
            var path = ReflectionUtils.GetHierarchyPath(gameObject);
            var haystack = $"{path} {visibleText} {string.Join(" ", componentNames)}";
            var score = Score(haystack);

            if (score <= 0)
            {
                continue;
            }

            hits.Add(new SearchHit(
                score,
                gameObject.activeInHierarchy,
                path,
                visibleText,
                componentNames));
        }

        return hits
            .OrderByDescending(hit => hit.Score)
            .ThenBy(hit => hit.Path, StringComparer.OrdinalIgnoreCase)
            .Take(maxHits)
            .ToArray();
    }

    public static IReadOnlyList<ComponentCandidate> FindCallablePackComponents()
    {
        var candidates = new List<ComponentCandidate>();
        var objects = Resources.FindObjectsOfTypeAll<GameObject>();

        foreach (var gameObject in objects)
        {
            if (!IsRuntimeObject(gameObject))
            {
                continue;
            }

            var path = ReflectionUtils.GetHierarchyPath(gameObject);
            var pathScore = Score(path);
            var components = gameObject.GetComponents<Component>().Where(component => component != null);

            foreach (var component in components)
            {
                var typeName = component.GetType().FullName ?? component.GetType().Name;
                var methods = ReflectionUtils.GetCallableZeroArgMethods(component)
                    .Where(method => LooksLikeOpenPackMethod(method.Name))
                    .ToArray();

                if (methods.Length == 0)
                {
                    continue;
                }

                var score = pathScore + Score(typeName) + methods.Max(method => Score(method.Name) + MethodNameBonus(method.Name));
                if (score <= 0)
                {
                    continue;
                }

                candidates.Add(new ComponentCandidate(score, path, component, methods));
            }
        }

        return candidates
            .OrderByDescending(candidate => candidate.Score)
            .ThenBy(candidate => candidate.Path, StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToArray();
    }

    private static bool IsRuntimeObject(GameObject gameObject)
    {
        if (gameObject == null)
        {
            return false;
        }

        if (!gameObject.scene.IsValid())
        {
            return false;
        }

        return (gameObject.hideFlags & HideFlags.HideAndDontSave) == 0;
    }

    private static int Score(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return 0;
        }

        var score = 0;
        foreach (var term in StrongTerms)
        {
            if (value.Contains(term, StringComparison.OrdinalIgnoreCase))
            {
                score += 10;
            }
        }

        foreach (var term in ContextTerms)
        {
            if (value.Contains(term, StringComparison.OrdinalIgnoreCase))
            {
                score += 3;
            }
        }

        return score;
    }

    private static bool LooksLikeOpenPackMethod(string methodName)
    {
        if (string.IsNullOrWhiteSpace(methodName))
        {
            return false;
        }

        var lower = methodName.ToLowerInvariant();
        var hasOpenVerb = lower.Contains("open") || lower.Contains("show") || lower.Contains("view") || lower.Contains("click") || lower.Contains("select");
        var hasPackNoun = lower.Contains("pack") || lower.Contains("library") || lower.Contains("collection") || lower.Contains("achievement");

        return hasOpenVerb && hasPackNoun;
    }

    private static int MethodNameBonus(string methodName)
    {
        var lower = methodName.ToLowerInvariant();

        if (lower.Contains("openpack") || lower.Contains("showpack") || lower.Contains("packlibrary"))
        {
            return 50;
        }

        if (lower.Contains("library") || lower.Contains("collection"))
        {
            return 25;
        }

        return 0;
    }
}

internal sealed class SearchHit
{
    public SearchHit(
        int score,
        bool activeInHierarchy,
        string path,
        string text,
        IReadOnlyList<string> components)
    {
        Score = score;
        ActiveInHierarchy = activeInHierarchy;
        Path = path;
        Text = text;
        Components = components;
    }

    public int Score { get; }

    public bool ActiveInHierarchy { get; }

    public string Path { get; }

    public string Text { get; }

    public IReadOnlyList<string> Components { get; }

    public string ToLogLine()
    {
        var text = string.IsNullOrWhiteSpace(Text) ? "" : $" text='{Text}'";
        return $"hit score={Score} active={ActiveInHierarchy} path='{Path}'{text} components=[{string.Join(", ", Components)}]";
    }
}

internal sealed class ComponentCandidate
{
    public ComponentCandidate(
        int score,
        string path,
        Component component,
        IReadOnlyList<System.Reflection.MethodInfo> methods)
    {
        Score = score;
        Path = path;
        Component = component;
        Methods = methods;
    }

    public int Score { get; }

    public string Path { get; }

    public Component Component { get; }

    public IReadOnlyList<System.Reflection.MethodInfo> Methods { get; }
}
