using System.Reflection;
using BepInEx.Logging;
using UnityEngine;

namespace PackViewerInVersus;

internal static class ReflectionUtils
{
    private const BindingFlags InstanceFlags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    public static string GetHierarchyPath(GameObject gameObject)
    {
        var names = new Stack<string>();
        var current = gameObject.transform;

        while (current != null)
        {
            names.Push(current.name);
            current = current.parent;
        }

        return string.Join("/", names);
    }

    public static string GetVisibleText(Component component)
    {
        var type = component.GetType();

        foreach (var propertyName in new[] { "text", "Text" })
        {
            var property = type.GetProperty(propertyName, InstanceFlags);
            if (property?.PropertyType == typeof(string))
            {
                return NormalizeText(property.GetValue(component) as string);
            }
        }

        foreach (var fieldName in new[] { "text", "m_Text" })
        {
            var field = type.GetField(fieldName, InstanceFlags);
            if (field?.FieldType == typeof(string))
            {
                return NormalizeText(field.GetValue(component) as string);
            }
        }

        return string.Empty;
    }

    public static IReadOnlyList<MethodInfo> GetCallableZeroArgMethods(Component component)
    {
        return component
            .GetType()
            .GetMethods(InstanceFlags)
            .Where(method => !method.IsSpecialName && method.GetParameters().Length == 0)
            .ToArray();
    }

    public static bool TryInvoke(Component component, MethodInfo method, ManualLogSource logger)
    {
        try
        {
            logger.LogInfo($"Invoking {component.GetType().FullName}.{method.Name}() on {GetHierarchyPath(component.gameObject)}");
            method.Invoke(component, Array.Empty<object>());
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"Invocation failed for {component.GetType().FullName}.{method.Name}(): {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static string NormalizeText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        return text.Replace('\n', ' ').Replace('\r', ' ').Trim();
    }
}
