using System;
using System.Linq;
using System.Reflection;

namespace PTT.Helpers;

internal static class ReflectionHelper
{
    private static MethodInfo _cachedLocalRaidEnded;
    private static MethodInfo _cachedLocalRaidStarted;

    /// <summary>
    /// Searches all loaded assemblies for a method matching the given name and parameter signature.
    /// </summary>
    public static MethodInfo FindMethodBySignature(string methodName, Type[] paramTypes)
    {
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                foreach (var type in asm.GetTypes())
                {
                    var method = type.GetMethod(methodName,
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static,
                        null, paramTypes, null);
                    if (method != null)
                    {
                        Logger.Info($"ReflectionHelper: Found {methodName} on {type.FullName}");
                        return method;
                    }
                }
            }
            catch
            {
                // Skip assemblies that cannot be reflected (e.g., mixed-mode, dynamic, or protected modules)
            }
        }
        return null;
    }

    /// <summary>
    /// Searches known class names for a method. Used as primary lookup for SPT version compatibility.
    /// </summary>
    private static MethodInfo FindMethodOnKnownTypes(string methodName, string[] classNames)
    {
        foreach (var name in classNames)
        {
            foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
            {
                try
                {
                    var type = asm.GetTypes().FirstOrDefault(t => t.Name == name);
                    if (type != null)
                    {
                        var method = type.GetMethod(methodName,
                            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
                        if (method != null)
                        {
                            Logger.Info($"ReflectionHelper: Found {methodName} on {type.FullName}");
                            return method;
                        }
                    }
                }
                catch
                {
                    // Skip assemblies that cannot be reflected
                }
            }
        }
        return null;
    }

    /// <summary>
    /// Fallback: searches every type in every assembly for a method by name alone.
    /// Use as last resort when known class names fail.
    /// </summary>
    private static MethodInfo FindMethodByNameAcrossAllAssemblies(string methodName)
    {
        foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
        {
            try
            {
                foreach (var type in asm.GetTypes())
                {
                    var method = type.GetMethod(methodName,
                        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
                    if (method != null)
                    {
                        Logger.Info($"ReflectionHelper: Found {methodName} on {type.FullName} (fallback search)");
                        return method;
                    }
                }
            }
            catch
            {
                // Skip assemblies that cannot be reflected
            }
        }
        return null;
    }

    /// <summary>
    /// Gets the LocalRaidEnded method with SPT version fallback.
    /// Tries: Class303 (SPT 3.11) -> Class301 (SPT 3.10) -> full assembly scan.
    /// </summary>
    public static MethodInfo GetLocalRaidEnded()
    {
        if (_cachedLocalRaidEnded != null) return _cachedLocalRaidEnded;

        _cachedLocalRaidEnded = FindMethodOnKnownTypes("LocalRaidEnded", new[] { "Class303", "Class301" });

        if (_cachedLocalRaidEnded == null)
        {
            _cachedLocalRaidEnded = FindMethodByNameAcrossAllAssemblies("LocalRaidEnded");
        }

        if (_cachedLocalRaidEnded == null)
        {
            Logger.Error("[PTT] Cannot find LocalRaidEnded method! SPT version may be unsupported. Patch will be disabled.");
        }

        return _cachedLocalRaidEnded;
    }

    /// <summary>
    /// Gets the LocalRaidStarted method with SPT version fallback.
    /// Tries: Class303 (SPT 3.11) -> Class301 (SPT 3.10) -> full assembly scan.
    /// </summary>
    public static MethodInfo GetLocalRaidStarted()
    {
        if (_cachedLocalRaidStarted != null) return _cachedLocalRaidStarted;

        _cachedLocalRaidStarted = FindMethodOnKnownTypes("LocalRaidStarted", new[] { "Class303", "Class301" });

        if (_cachedLocalRaidStarted == null)
        {
            _cachedLocalRaidStarted = FindMethodByNameAcrossAllAssemblies("LocalRaidStarted");
        }

        if (_cachedLocalRaidStarted == null)
        {
            Logger.Error("[PTT] Cannot find LocalRaidStarted method! SPT version may be unsupported. Patch will be disabled.");
        }

        return _cachedLocalRaidStarted;
    }
}
