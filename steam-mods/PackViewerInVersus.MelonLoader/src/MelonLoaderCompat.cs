#if MELONLOADER
using MelonLoader;

namespace BepInEx
{
    internal static class Paths
    {
        public static string GameRootPath => MelonLoader.Utils.MelonEnvironment.GameRootDirectory;
        public static string ConfigPath => MelonLoader.Utils.MelonEnvironment.UserDataDirectory;
    }
}

namespace BepInEx.Logging
{
    internal sealed class ManualLogSource
    {
        private readonly MelonLogger.Instance _logger;

        public ManualLogSource(MelonLogger.Instance logger)
        {
            _logger = logger;
        }

        public void LogInfo(object message)
        {
            _logger.Msg(message?.ToString() ?? string.Empty);
        }

        public void LogWarning(object message)
        {
            _logger.Warning(message?.ToString() ?? string.Empty);
        }

        public void LogError(object message)
        {
            _logger.Error(message?.ToString() ?? string.Empty);
        }
    }
}

namespace PackViewerInVersus
{
    internal static class DebugConfig
    {
        private static Dictionary<string, string> _values;

        public static bool IsEnabled(string key, bool defaultValue)
        {
            var env = Environment.GetEnvironmentVariable($"PV_DIAG_{key.ToUpperInvariant()}");
            if (TryParseBool(env, out var envValue))
            {
                return envValue;
            }

            if (Values.TryGetValue(key, out var raw) && TryParseBool(raw, out var fileValue))
            {
                return fileValue;
            }

            return defaultValue;
        }

        public static HashSet<string> GetCsv(string key)
        {
            var raw = Environment.GetEnvironmentVariable($"PV_DIAG_{key.ToUpperInvariant()}");
            if (string.IsNullOrWhiteSpace(raw))
            {
                Values.TryGetValue(key, out raw);
            }

            if (string.IsNullOrWhiteSpace(raw))
            {
                return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            }

            return raw.Split(',')
                .Select(value => value.Trim())
                .Where(value => value.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
        }

        public static int GetInt(string key, int defaultValue)
        {
            var raw = Environment.GetEnvironmentVariable($"PV_DIAG_{key.ToUpperInvariant()}");
            if (string.IsNullOrWhiteSpace(raw))
            {
                Values.TryGetValue(key, out raw);
            }

            return int.TryParse(raw, out var parsed) ? parsed : defaultValue;
        }

        private static Dictionary<string, string> Values
        {
            get
            {
                if (_values != null)
                {
                    return _values;
                }

                _values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                var path = Path.Combine(BepInEx.Paths.ConfigPath, "PackViewerInVersus.debug");
                if (!File.Exists(path))
                {
                    return _values;
                }

                foreach (var line in File.ReadAllLines(path))
                {
                    var trimmed = line.Trim();
                    if (trimmed.Length == 0 || trimmed.StartsWith("#", StringComparison.Ordinal))
                    {
                        continue;
                    }

                    var equalsIndex = trimmed.IndexOf('=');
                    if (equalsIndex <= 0)
                    {
                        continue;
                    }

                    _values[trimmed[..equalsIndex].Trim()] = trimmed[(equalsIndex + 1)..].Trim();
                }

                return _values;
            }
        }

        private static bool TryParseBool(string raw, out bool value)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                value = false;
                return false;
            }

            if (raw.Equals("1", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("true", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("yes", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("on", StringComparison.OrdinalIgnoreCase))
            {
                value = true;
                return true;
            }

            if (raw.Equals("0", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("false", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("no", StringComparison.OrdinalIgnoreCase) ||
                raw.Equals("off", StringComparison.OrdinalIgnoreCase))
            {
                value = false;
                return true;
            }

            value = false;
            return false;
        }
    }
}
#endif
