using UnityEngine;
using System.Collections;
using System.Reflection;
using Spacewood.Core.Models;

namespace PackViewerInVersus;

internal static class DiagnosticsUtility
{
    private const BindingFlags InstanceFlags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    private static readonly string[] ExactTypeNames =
    {
        "Spacewood.Unity.Menu",
        "Spacewood.Unity.PackShop",
        "Spacewood.Unity.PackProduct",
        "Spacewood.Unity.ProductView",
        "Spacewood.Unity.PackLibrary",
        "Spacewood.Unity.AbilityLibrary",
        "Spacewood.Scripts.Codec.DeckBuilder",
        "Spacewood.Scripts.Codec.DeckBuyer",
        "Spacewood.Unity.MonoBehaviours.Build.HangarMain",
        "Spacewood.Unity.MonoBehaviours.Build.HangarMenu",
        "Spacewood.Unity.MonoBehaviours.Build.HangarOverlay",
        "Spacewood.Unity.MonoBehaviours.Build.Hangar.States.HangarStateBase",
        "Spacewood.Unity.MonoBehaviours.Build.DeckViewer"
    };

    private static readonly string[] FuzzyTypeTerms =
    {
        "PackShop",
        "PackProduct",
        "ProductView",
        "DeckViewer",
        "DeckBuilder",
        "DeckBuyer",
        "HangarMain",
        "HangarMenu",
        "HangarOverlay",
        "HangarScoreboard",
        "HangarScoreboardEntry",
        "HangarState",
        "PackLibrary",
        "AbilityLibrary"
    };

    private static readonly string[] InterestingPropertyNames =
    {
        "PackShop",
        "DeckBuilder",
        "DeckBuyer",
        "DeckViewer",
        "DeckViewerButton",
        "Menu",
        "Pack",
        "Deck",
        "DeckId",
        "Custom",
        "Products",
        "EquippedProduct",
        "LastProduct",
        "TurtlePack",
        "ChallengePack",
        "WackyPack",
        "PlusPack",
        "PackProduct",
        "PackProductPrefab",
        "PackProductCustomPrefab",
        "Scoreboard",
        "ScoreboardMini",
        "Entries",
        "ShowPack",
        "PackStandard",
        "PackStandardImage",
        "PackCustom",
        "PackChallenge",
        "MatchModel",
        "BuildModel",
        "Versus",
        "Opponent",
        "Opponents",
        "NextOpponentId",
        "MatchPack",
        "UserId",
        "ParticipationId",
        "OpponentId",
        "UserName",
        "BoardAdjective",
        "BoardNoun",
        "Lives",
        "WildPack",
        "PreviewButton",
        "OnPreview",
        "OnClick",
        "OnSubmit"
    };

    private static readonly string[] InterestingMethodTerms =
    {
        "Open",
        "StartPack",
        "PackShop",
        "Preview",
        "DeckViewer",
        "HandleViewer",
        "HandlePack",
        "HandlePreview",
        "HandleSubmit",
        "HandleOpponent",
        "OpenScoreboard",
        "Scoreboard",
        "FocusPack",
        "SetModel"
    };

    public static IReadOnlyList<string> GetCanvasDiagnostics()
    {
        return Resources.FindObjectsOfTypeAll<Canvas>()
            .Where(canvas => canvas != null && canvas.gameObject != null && canvas.gameObject.scene.IsValid())
            .OrderByDescending(canvas => canvas.gameObject.activeInHierarchy)
            .ThenByDescending(canvas => canvas.sortingOrder)
            .Take(25)
            .Select(canvas => $"active={canvas.gameObject.activeInHierarchy} renderMode={canvas.renderMode} sorting={canvas.sortingOrder} camera={(canvas.worldCamera != null ? canvas.worldCamera.name : "<none>")} path='{ReflectionUtils.GetHierarchyPath(canvas.gameObject)}'")
            .ToArray();
    }

    public static IReadOnlyList<string> GetObjectDiagnostics()
    {
        var lines = new List<string>();
        AddTypedObjectDiagnostics<global::Spacewood.Unity.Menu>(lines, "typed Menu");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.PackShop>(lines, "typed PackShop");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.PackProduct>(lines, "typed PackProduct");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.ProductView>(lines, "typed ProductView");
        AddTypedObjectDiagnostics<global::Spacewood.Scripts.Codec.DeckBuilder>(lines, "typed DeckBuilder");
        AddTypedObjectDiagnostics<global::Spacewood.Scripts.Codec.DeckBuyer>(lines, "typed DeckBuyer");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.MonoBehaviours.Build.HangarMain>(lines, "typed HangarMain");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.MonoBehaviours.Build.HangarMenu>(lines, "typed HangarMenu");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.MonoBehaviours.Build.HangarOverlay>(lines, "typed HangarOverlay");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboard>(lines, "typed HangarScoreboard");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry>(lines, "typed HangarScoreboardEntry");
        AddTypedObjectDiagnostics<global::Spacewood.Unity.MonoBehaviours.Build.DeckViewer>(lines, "typed DeckViewer");
        AddOpponentModelDiagnostics(lines);

        var totalComponents = 0;
        var sceneComponents = 0;
        var exactHits = 0;
        var fuzzyHits = 0;

        foreach (var component in Resources.FindObjectsOfTypeAll<Component>())
        {
            totalComponents++;
            if (component == null || component.gameObject == null)
            {
                continue;
            }

            var typeName = component.GetType().FullName;
            var sceneValid = component.gameObject.scene.IsValid();
            if (sceneValid)
            {
                sceneComponents++;
            }

            var exact = ExactTypeNames.Contains(typeName, StringComparer.Ordinal);
            var fuzzy = FuzzyTypeTerms.Any(term => typeName?.Contains(term, StringComparison.Ordinal) == true);
            if (!exact && !fuzzy)
            {
                continue;
            }

            if (exact)
            {
                exactHits++;
            }
            else
            {
                fuzzyHits++;
            }

            lines.Add(DescribeComponent(component, exact ? "exact" : "fuzzy", sceneValid));
            lines.AddRange(DescribeInterestingProperties(component).Select(line => $"  {line}"));
            lines.AddRange(DescribeInterestingMethods(component).Select(line => $"  {line}"));
        }

        lines.Insert(0, $"component scan total={totalComponents} sceneValid={sceneComponents} exactHits={exactHits} fuzzyHits={fuzzyHits} typedLines={lines.Count}");

        if (lines.Count == 0)
        {
            lines.Add("no pack-viewer-related components found");
        }

        return lines;
    }

    private static void AddTypedObjectDiagnostics<T>(List<string> lines, string label)
        where T : UnityEngine.Object
    {
        try
        {
            var objects = Resources.FindObjectsOfTypeAll<T>()
                .Where(item => item != null)
                .OrderByDescending(IsActiveInHierarchy)
                .Take(12)
                .ToArray();

            lines.Add($"{label}: count={objects.Length}");
            foreach (var item in objects)
            {
                lines.Add(DescribeTypedObject(item, label));
                if (item is Component component)
                {
                    lines.AddRange(DescribeInterestingProperties(component).Select(line => $"  {line}"));
                    lines.AddRange(DescribeInterestingMethods(component).Select(line => $"  {line}"));
                }
            }
        }
        catch (Exception ex)
        {
            lines.Add($"{label}: scan failed {ex.GetType().Name}: {ex.Message}");
        }
    }

    private static bool IsActiveInHierarchy(UnityEngine.Object item)
    {
        return item is Component component && component.gameObject != null && component.gameObject.activeInHierarchy;
    }

    private static void AddOpponentModelDiagnostics(List<string> lines)
    {
        try
        {
            var hangars = Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.MonoBehaviours.Build.HangarMain>()
                .Where(item => item != null && item.gameObject != null && item.gameObject.scene.IsValid())
                .OrderByDescending(item => item.gameObject.activeInHierarchy)
                .Take(4)
                .ToArray();

            lines.Add($"typed opponent models: hangars={hangars.Length}");
            foreach (var hangar in hangars)
            {
                try
                {
                    var match = hangar.MatchModel;
                    lines.Add($"typed opponent model hangar: {DescribeTypedObject(hangar, "HangarMain")} match={DescribeMatchSafe(match)}");
                    AddVersusOpponentDiagnostics(lines, match);
                }
                catch (Exception ex)
                {
                    lines.Add($"typed opponent model hangar failed: {DescribeTypedObject(hangar, "HangarMain")} error={ex.GetType().Name}: {ex.Message}");
                }
            }
        }
        catch (Exception ex)
        {
            lines.Add($"typed opponent models: scan failed {ex.GetType().Name}: {ex.Message}");
        }
    }

    private static void AddVersusOpponentDiagnostics(List<string> lines, UserMatchModel match)
    {
        var versus = match?.Versus;
        var opponents = versus?.Opponents;
        if (match == null || versus == null || opponents == null)
        {
            return;
        }

        var currentParticipationId = match.ParticipationId.ToString();
        var nextOpponentId = NullableGuidToString(versus.NextOpponentId);
        for (var i = 0; i < opponents.Count && i < 8; i++)
        {
            var opponent = opponents[i];
            if (opponent == null)
            {
                lines.Add($"typed opponent[{i}]: <null>");
                continue;
            }

            lines.Add($"typed opponent[{i}]: {DescribeOpponent(opponent, currentParticipationId, nextOpponentId)}");
        }
    }

    private static string DescribeMatch(UserMatchModel match)
    {
        if (match == null)
        {
            return "<null>";
        }

        var versus = match.Versus;
        var opponentCount = versus?.Opponents?.Count ?? -1;
        var nextOpponentId = versus != null ? NullableGuidToString(versus.NextOpponentId) : null;
        return $"participation={match.ParticipationId} pack={match.Pack} wild={match.WildPack} user='{match.UserName}' versus={(versus != null ? "yes" : "no")} opponents={opponentCount} nextOpponent={nextOpponentId ?? "<none>"}";
    }

    private static string DescribeMatchSafe(UserMatchModel match)
    {
        try
        {
            return DescribeMatch(match);
        }
        catch (Exception ex)
        {
            return $"<read failed {ex.GetType().Name}: {ex.Message}>";
        }
    }

    private static string DescribeOpponent(UserVersusOpponent opponent, string currentParticipationId, string nextOpponentId)
    {
        var participationId = opponent.ParticipationId.ToString();
        var userId = opponent.UserId.ToString();
        var isSelf = string.Equals(participationId, currentParticipationId, StringComparison.OrdinalIgnoreCase);
        var isNext = !string.IsNullOrWhiteSpace(nextOpponentId)
            && (string.Equals(participationId, nextOpponentId, StringComparison.OrdinalIgnoreCase)
                || string.Equals(userId, nextOpponentId, StringComparison.OrdinalIgnoreCase));

        return $"user={userId} participation={participationId} self={isSelf} next={isNext} name='{opponent.BoardAdjective} {opponent.BoardNoun}' pack={opponent.Pack} wild={opponent.WildPack} lives={opponent.Lives}";
    }

    private static string NullableGuidToString(Il2CppSystem.Nullable<Il2CppSystem.Guid> value)
    {
        return value.HasValue ? value.Value.ToString() : null;
    }

    private static string DescribeTypedObject(UnityEngine.Object item, string label)
    {
        if (item is Component component && component.gameObject != null)
        {
            return $"{label}: type={item.GetType().FullName} activeSelf={component.gameObject.activeSelf} activeHierarchy={component.gameObject.activeInHierarchy} scene='{(component.gameObject.scene.IsValid() ? component.gameObject.scene.name : "<invalid>")}' path='{ReflectionUtils.GetHierarchyPath(component.gameObject)}'";
        }

        return $"{label}: type={item.GetType().FullName} name='{item.name}'";
    }

    private static string DescribeComponent(Component component, string matchKind, bool sceneValid)
    {
        var gameObject = component.gameObject;
        var sceneName = sceneValid ? gameObject.scene.name ?? "<unnamed>" : "<invalid>";
        return $"{matchKind} type={component.GetType().FullName} activeSelf={gameObject.activeSelf} activeHierarchy={gameObject.activeInHierarchy} scene='{sceneName}' path='{ReflectionUtils.GetHierarchyPath(gameObject)}'";
    }

    private static IEnumerable<string> DescribeInterestingProperties(Component component)
    {
        var type = component.GetType();
        foreach (var property in type.GetProperties(InstanceFlags)
            .Where(property => InterestingPropertyNames.Contains(property.Name, StringComparer.Ordinal))
            .OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            if (property.GetIndexParameters().Length != 0)
            {
                continue;
            }

            yield return $"prop {property.Name}:{ShortTypeName(property.PropertyType)}={ReadProperty(component, property)}";
        }
    }

    private static IEnumerable<string> DescribeInterestingMethods(Component component)
    {
        var type = component.GetType();
        foreach (var method in type.GetMethods(InstanceFlags)
            .Where(method => !method.IsSpecialName)
            .Where(method => InterestingMethodTerms.Any(term => method.Name.Contains(term, StringComparison.OrdinalIgnoreCase)))
            .OrderBy(method => method.Name, StringComparer.Ordinal)
            .Take(30))
        {
            yield return $"method {FormatMethod(method)}";
        }
    }

    private static string ReadProperty(object target, PropertyInfo property)
    {
        try
        {
            var value = property.GetValue(target);
            return DescribeValue(value);
        }
        catch (Exception ex)
        {
            return $"<read failed {ex.GetType().Name}: {ex.Message}>";
        }
    }

    private static string DescribeValue(object value)
    {
        if (value == null)
        {
            return "<null>";
        }

        if (value is GameObject gameObject)
        {
            return $"GameObject active={gameObject.activeInHierarchy} path='{ReflectionUtils.GetHierarchyPath(gameObject)}'";
        }

        if (value is Component component)
        {
            return $"{component.GetType().FullName} active={component.gameObject.activeInHierarchy} path='{ReflectionUtils.GetHierarchyPath(component.gameObject)}'";
        }

        if (value is Transform transform)
        {
            return $"Transform active={transform.gameObject.activeInHierarchy} path='{ReflectionUtils.GetHierarchyPath(transform.gameObject)}'";
        }

        if (value is IEnumerable enumerable && value is not string)
        {
            return DescribeEnumerable(value, enumerable);
        }

        var valueType = value.GetType();
        if (valueType.FullName?.StartsWith("Il2CppSystem.Nullable`1", StringComparison.Ordinal) == true)
        {
            return DescribeNullable(value);
        }

        if (valueType.IsPrimitive || value is string || valueType.IsEnum)
        {
            return value.ToString();
        }

        return $"{ShortTypeName(valueType)} {SafeToString(value)}";
    }

    private static string DescribeEnumerable(object value, IEnumerable enumerable)
    {
        var count = TryReadCount(value);
        var items = new List<string>();
        try
        {
            foreach (var item in enumerable)
            {
                items.Add(DescribeValue(item));
                if (items.Count >= 3)
                {
                    break;
                }
            }
        }
        catch (Exception ex)
        {
            items.Add($"<enumerate failed {ex.GetType().Name}: {ex.Message}>");
        }

        var countPart = count >= 0 ? $"count={count}" : "count=<unknown>";
        return $"{ShortTypeName(value.GetType())} {countPart} sample=[{string.Join("; ", items)}]";
    }

    private static int TryReadCount(object value)
    {
        try
        {
            var countProperty = value.GetType().GetProperty("Count", InstanceFlags);
            if (countProperty?.PropertyType == typeof(int))
            {
                return (int)countProperty.GetValue(value);
            }
        }
        catch
        {
            return -1;
        }

        return -1;
    }

    private static string DescribeNullable(object value)
    {
        try
        {
            var type = value.GetType();
            var hasValue = type.GetProperty("HasValue", InstanceFlags)?.GetValue(value);
            var innerValue = type.GetProperty("Value", InstanceFlags)?.GetValue(value);
            return $"{ShortTypeName(type)} HasValue={hasValue} Value={DescribeValue(innerValue)}";
        }
        catch (Exception ex)
        {
            return $"{ShortTypeName(value.GetType())} <nullable read failed {ex.GetType().Name}: {ex.Message}>";
        }
    }

    private static string FormatMethod(MethodInfo method)
    {
        var parameters = method.GetParameters();
        var parameterText = string.Join(", ", parameters.Select(parameter => $"{ShortTypeName(parameter.ParameterType)} {parameter.Name}"));
        return $"{ShortTypeName(method.ReturnType)} {method.Name}({parameterText})";
    }

    private static string ShortTypeName(Type type)
    {
        if (!type.IsGenericType)
        {
            return type.FullName ?? type.Name;
        }

        var genericName = type.FullName ?? type.Name;
        var tickIndex = genericName.IndexOf('`');
        if (tickIndex >= 0)
        {
            genericName = genericName[..tickIndex];
        }

        return $"{genericName}<{string.Join(",", type.GetGenericArguments().Select(ShortTypeName))}>";
    }

    private static string SafeToString(object value)
    {
        try
        {
            return value.ToString();
        }
        catch (Exception ex)
        {
            return $"<ToString failed {ex.GetType().Name}: {ex.Message}>";
        }
    }
}
