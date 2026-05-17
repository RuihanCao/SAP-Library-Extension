using BepInEx.Logging;
using UnityEngine;
using System.Reflection;
using Spacewood.Core.Enums;
using Spacewood.Core.Models;

namespace PackViewerInVersus;

internal static class PackViewerLauncher
{
    private const BindingFlags InstanceFlags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;

    private const string HangarMainTypeName = "Spacewood.Unity.MonoBehaviours.Build.HangarMain";
    private const string DeckViewerTypeName = "Spacewood.Unity.MonoBehaviours.Build.DeckViewer";
    private const string HangarStateBaseTypeName = "Spacewood.Unity.MonoBehaviours.Build.Hangar.States.HangarStateBase";
    private const string PackShopTypeName = "Spacewood.Unity.PackShop";

    public static void TryOpenFromHangarMain(object hookContext, ManualLogSource logger)
    {
        if (TryOpenOpponentPackFromHangar(hookContext, logger))
        {
            return;
        }

        if (TryOpenFromHangar(hookContext, logger))
        {
            return;
        }

        if (TryOpenFromPackShop(logger))
        {
            return;
        }

        if (TryOpenFromMenu(logger))
        {
            return;
        }

        if (TryOpenDeckViewerDirectly(logger))
        {
            return;
        }

        logger.LogWarning("No pack-viewer opener worked. Press F8 in the pack screen and versus shop to compare live DeckViewer/PackShop/HangarMain objects.");
    }

    public static void TryOpenPackViewer(ManualLogSource logger)
    {
        var candidates = UnityObjectScanner.FindCallablePackComponents();

        if (candidates.Count == 0)
        {
            logger.LogWarning("No conservative pack-viewer method candidates found. Press F8 in the pack screen and versus shop to collect object names.");
            return;
        }

        foreach (var candidate in candidates)
        {
            logger.LogInfo($"candidate score={candidate.Score} path='{candidate.Path}' component={candidate.Component.GetType().FullName} methods=[{string.Join(", ", candidate.Methods.Select(method => method.Name))}]");
        }

        var best = candidates[0];
        var method = best.Methods
            .OrderByDescending(method => method.Name.Contains("open", StringComparison.OrdinalIgnoreCase) ? 2 : 0)
            .ThenByDescending(method => method.Name.Contains("pack", StringComparison.OrdinalIgnoreCase) ? 2 : 0)
            .ThenByDescending(method => method.Name.Contains("library", StringComparison.OrdinalIgnoreCase) ? 1 : 0)
            .First();

        ReflectionUtils.TryInvoke(best.Component, method, logger);
    }

    public static bool TryOpenFromScoreboardEntry(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        ManualLogSource logger)
    {
        if (entry == null)
        {
            return false;
        }

        var hangarMain = FindBestHangarMain();
        if (hangarMain == null)
        {
            logger.LogWarning("Could not open scoreboard pack because no HangarMain instance was available.");
            return false;
        }

        var deckViewer = hangarMain.DeckViewer ?? FindBestDeckViewer();
        if (deckViewer == null)
        {
            logger.LogWarning("Could not open scoreboard pack because no DeckViewer instance was available.");
            return false;
        }

        var currentParticipationId = TryReadCurrentParticipationId(hangarMain.MatchModel);
        var nextOpponentId = TryReadNextOpponentId(hangarMain.MatchModel);
        if (!TryReadEntryOpponent(entry, currentParticipationId, nextOpponentId, logger, out var pack, out var description, out _, out _))
        {
            logger.LogWarning($"Clicked scoreboard pack icon, but no predefined pack could be read from entry={DescribeComponent(entry)}.");
            return false;
        }

        try
        {
            logger.LogInfo($"Opening clicked scoreboard pack viewer for {pack}; opponent={description}.");
            OpenDeckViewerForPack(hangarMain, deckViewer, pack);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"Clicked scoreboard pack viewer route failed for {pack}: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static bool TryOpenFromHangar(object hookContext, ManualLogSource logger)
    {
        var deckViewer = FindBestDeckViewer();
        if (deckViewer == null)
        {
            logger.LogWarning("Could not open pack viewer because no DeckViewer instance was available.");
            return false;
        }

        var hangarMain = ResolveHangarMain(hookContext) as global::Spacewood.Unity.MonoBehaviours.Build.HangarMain;
        if (hangarMain == null)
        {
            logger.LogWarning("Could not open pack viewer because no HangarMain instance was available.");
        }
        else if (TryOpenWithHangarMain(hangarMain, deckViewer, logger))
        {
            return true;
        }

        if (TryInvokeOneArg(
            hookContext,
            "OnDeckViewerSubmit",
            DeckViewerTypeName,
            deckViewer,
            "hookContext.OnDeckViewerSubmit(DeckViewer)",
            logger))
        {
            return true;
        }

        return false;
    }

    private static bool TryOpenOpponentPackFromHangar(object hookContext, ManualLogSource logger)
    {
        var hangarMain = ResolveHangarMain(hookContext) as global::Spacewood.Unity.MonoBehaviours.Build.HangarMain;
        if (hangarMain == null)
        {
            logger.LogInfo("Opponent pack route unavailable: no HangarMain instance.");
            return false;
        }

        var deckViewer = hangarMain.DeckViewer ?? FindBestDeckViewer();
        if (deckViewer == null)
        {
            logger.LogWarning("Opponent pack route found HangarMain but no DeckViewer.");
            return false;
        }

        if (!TryResolveOpponentPackFromScoreboard(hangarMain, logger, out var pack, out var description)
            && !TryResolveOpponentPackSafe(hangarMain.MatchModel, logger, out pack, out description))
        {
            logger.LogInfo("Opponent pack route unavailable: no predefined opponent pack found.");
            return false;
        }

        try
        {
            logger.LogInfo($"Opening opponent pack viewer for {pack}; opponent={description}; hangar={DescribeComponent(hangarMain)} deckViewer={DescribeComponent(deckViewer)}.");
            OpenDeckViewerForPack(hangarMain, deckViewer, pack);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"Opponent pack viewer route failed for {pack}: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static void OpenDeckViewerForPack(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarMain hangarMain,
        global::Spacewood.Unity.MonoBehaviours.Build.DeckViewer deckViewer,
        Pack pack)
    {
        if (deckViewer.gameObject != null && !deckViewer.gameObject.activeInHierarchy)
        {
            hangarMain.HandleDeckViewerSubmit(deckViewer);
        }

        deckViewer.SetModel(pack, null, new Il2CppSystem.Nullable<int>(), false);
    }

    private static bool TryResolveOpponentPackFromScoreboard(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarMain hangarMain,
        ManualLogSource logger,
        out Pack pack,
        out string description)
    {
        pack = default;
        description = "<none>";

        var currentParticipationId = TryReadCurrentParticipationId(hangarMain.MatchModel);
        var nextOpponentId = TryReadNextOpponentId(hangarMain.MatchModel);
        var entries = Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry>()
            .Where(entry => entry != null && entry.gameObject != null && entry.gameObject.scene.IsValid())
            .Where(entry => entry.gameObject.activeInHierarchy)
            .OrderByDescending(entry => ReflectionUtils.GetHierarchyPath(entry.gameObject).Contains("/Scoreboard/", StringComparison.OrdinalIgnoreCase))
            .ToArray();

        logger.LogInfo($"Opponent scoreboard route: activeEntries={entries.Length} currentParticipation={currentParticipationId ?? "<unknown>"} nextOpponent={nextOpponentId ?? "<none>"}.");

        var candidates = new List<(Pack Pack, string Description, bool IsNext, bool IsSelf)>();
        foreach (var entry in entries)
        {
            if (!TryReadEntryOpponent(entry, currentParticipationId, nextOpponentId, logger, out var candidatePack, out var candidateDescription, out var isNext, out var isSelf))
            {
                continue;
            }

            candidates.Add((candidatePack, candidateDescription, isNext, isSelf));
        }

        if (candidates.Count == 0)
        {
            return false;
        }

        var chosen = candidates
            .OrderByDescending(candidate => candidate.IsNext)
            .ThenBy(candidate => candidate.IsSelf)
            .First();

        pack = chosen.Pack;
        description = $"scoreboard {chosen.Description}";
        return true;
    }

    private static bool TryReadEntryOpponent(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarScoreboardEntry entry,
        string currentParticipationId,
        string nextOpponentId,
        ManualLogSource logger,
        out Pack pack,
        out string description,
        out bool isNext,
        out bool isSelf)
    {
        pack = default;
        description = "<none>";
        isNext = false;
        isSelf = false;

        try
        {
            var opponent = entry.Opponent;
            if (opponent == null)
            {
                return false;
            }

            var participationId = opponent.ParticipationId.ToString();
            var userId = opponent.UserId.ToString();
            isSelf = !string.IsNullOrWhiteSpace(currentParticipationId)
                && string.Equals(participationId, currentParticipationId, StringComparison.OrdinalIgnoreCase);
            isNext = !string.IsNullOrWhiteSpace(nextOpponentId)
                && (string.Equals(participationId, nextOpponentId, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(userId, nextOpponentId, StringComparison.OrdinalIgnoreCase));

            pack = opponent.Pack;
            description = $"{DescribeOpponent(opponent, currentParticipationId, nextOpponentId)} path='{ReflectionUtils.GetHierarchyPath(entry.gameObject)}'";
            logger.LogInfo($"Opponent scoreboard candidate: {description}");
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"Opponent scoreboard entry read failed: entry={DescribeComponent(entry)} error={ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static bool TryResolveOpponentPackSafe(UserMatchModel match, ManualLogSource logger, out Pack pack, out string description)
    {
        try
        {
            return TryResolveOpponentPack(match, logger, out pack, out description);
        }
        catch (Exception ex)
        {
            pack = default;
            description = "<none>";
            logger.LogWarning($"Opponent pack model read failed; falling back to current pack route. match={DescribeMatchSafe(match)} error={ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static bool TryResolveOpponentPack(UserMatchModel match, ManualLogSource logger, out Pack pack, out string description)
    {
        pack = default;
        description = "<none>";

        var versus = match?.Versus;
        var opponents = versus?.Opponents;
        if (match == null || versus == null || opponents == null || opponents.Count == 0)
        {
            logger.LogInfo($"Opponent pack model unavailable: match={DescribeMatchSafe(match)}.");
            return false;
        }

        var currentParticipationId = match.ParticipationId.ToString();
        var nextOpponentId = NullableGuidToString(versus.NextOpponentId);
        var candidates = new List<UserVersusOpponent>();
        for (var i = 0; i < opponents.Count; i++)
        {
            var opponent = opponents[i];
            if (opponent != null)
            {
                candidates.Add(opponent);
                logger.LogInfo($"Opponent pack candidate[{i}]: {DescribeOpponent(opponent, currentParticipationId, nextOpponentId)}");
            }
        }

        if (candidates.Count == 0)
        {
            return false;
        }

        var chosen = candidates.FirstOrDefault(opponent => MatchesGuid(opponent, nextOpponentId))
            ?? candidates.FirstOrDefault(opponent => opponent.ParticipationId.ToString() != currentParticipationId)
            ?? candidates[0];

        pack = chosen.Pack;
        description = DescribeOpponent(chosen, currentParticipationId, nextOpponentId);
        return true;
    }

    private static bool MatchesGuid(UserVersusOpponent opponent, string guid)
    {
        return !string.IsNullOrWhiteSpace(guid)
            && (string.Equals(opponent.UserId.ToString(), guid, StringComparison.OrdinalIgnoreCase)
                || string.Equals(opponent.ParticipationId.ToString(), guid, StringComparison.OrdinalIgnoreCase));
    }

    private static string NullableGuidToString(Il2CppSystem.Nullable<Il2CppSystem.Guid> value)
    {
        return value.HasValue ? value.Value.ToString() : null;
    }

    private static string TryReadCurrentParticipationId(UserMatchModel match)
    {
        try
        {
            return match?.ParticipationId.ToString();
        }
        catch
        {
            return null;
        }
    }

    private static string TryReadNextOpponentId(UserMatchModel match)
    {
        try
        {
            var versus = match?.Versus;
            return versus == null ? null : NullableGuidToString(versus.NextOpponentId);
        }
        catch
        {
            return null;
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
        return $"participation={match.ParticipationId} pack={match.Pack} wild={match.WildPack} versus={(versus != null ? "yes" : "no")} opponents={opponentCount}";
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

    private static bool TryOpenFromPackShop(ManualLogSource logger)
    {
        var packShop = FindBestPackShop(requireActive: true);
        if (packShop == null)
        {
            logger.LogInfo("No PackShop instance found for pack-viewer opener fallback.");
            return false;
        }

        var deckViewer = packShop.DeckViewer ?? FindBestDeckViewer();
        if (deckViewer == null)
        {
            logger.LogWarning("PackShop opener fallback found PackShop but no DeckViewer.");
            return false;
        }

        var packProduct = FindBestPackProduct(packShop);
        if (packProduct != null && TryPreviewPackProduct(packShop, packProduct, logger))
        {
            return true;
        }

        try
        {
            logger.LogInfo($"Opening pack viewer through PackShop.HandleDeckViewerClick(DeckViewer); packShop={DescribeComponent(packShop)} deckViewer={DescribeComponent(deckViewer)}.");
            packShop.HandleDeckViewerClick(deckViewer);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"PackShop.HandleDeckViewerClick(DeckViewer) failed: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static global::Spacewood.Unity.PackProduct FindBestPackProduct(global::Spacewood.Unity.PackShop packShop)
    {
        if (packShop.EquippedProduct != null)
        {
            return packShop.EquippedProduct;
        }

        if (packShop.LastProduct != null)
        {
            return packShop.LastProduct;
        }

        var activeProduct = Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.PackProduct>()
            .Where(item => item != null && item.gameObject != null && item.gameObject.scene.IsValid())
            .Where(item => item.gameObject.activeInHierarchy)
            .OrderByDescending(item => ReflectionUtils.GetHierarchyPath(item.gameObject).Contains("/PackShop/", StringComparison.OrdinalIgnoreCase))
            .FirstOrDefault();
        if (activeProduct != null)
        {
            return activeProduct;
        }

        return packShop.TurtlePack
            ?? packShop.ChallengePack
            ?? packShop.WackyPack
            ?? packShop.PlusPack;
    }

    private static bool TryPreviewPackProduct(
        global::Spacewood.Unity.PackShop packShop,
        global::Spacewood.Unity.PackProduct packProduct,
        ManualLogSource logger)
    {
        try
        {
            logger.LogInfo($"Opening pack viewer through PackShop.HandlePackPreview(ProductView); packShop={DescribeComponent(packShop)} product={DescribeComponent(packProduct)}.");
            packShop.HandlePackPreview(packProduct);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"PackShop.HandlePackPreview(ProductView) failed: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static bool TryOpenFromMenu(ManualLogSource logger)
    {
        var menu = Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.Menu>()
            .Where(item => item != null && item.gameObject != null && item.gameObject.scene.IsValid())
            .OrderByDescending(item => item.gameObject.activeInHierarchy)
            .FirstOrDefault();
        if (menu == null)
        {
            return false;
        }

        try
        {
            var method = menu.GetType().GetMethod("StartPackShop", InstanceFlags);
            if (method == null || method.GetParameters().Length != 0)
            {
                logger.LogInfo("Menu fallback unavailable: StartPackShop() was not found.");
                return false;
            }

            logger.LogInfo($"Opening pack shop through Menu.StartPackShop(); menu={DescribeComponent(menu)}.");
            method.Invoke(menu, Array.Empty<object>());
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"Menu.StartPackShop() fallback failed: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static bool TryOpenDeckViewerDirectly(ManualLogSource logger)
    {
        var deckViewer = FindBestDeckViewer();
        if (deckViewer == null)
        {
            return false;
        }

        try
        {
            var method = deckViewer.GetType().GetMethod("HandleClick", InstanceFlags);
            if (method == null || method.GetParameters().Length != 0)
            {
                logger.LogWarning("DeckViewer direct fallback found DeckViewer but no zero-arg HandleClick().");
                return false;
            }

            logger.LogInfo($"Opening pack viewer through DeckViewer.HandleClick() on {DescribeComponent(deckViewer)}.");
            method.Invoke(deckViewer, Array.Empty<object>());
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"DeckViewer.HandleClick() fallback failed: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static object ResolveHangarMain(object context)
    {
        if (context == null)
        {
            return FindBestHangarMain();
        }

        var type = context.GetType();
        if (type.FullName == HangarMainTypeName)
        {
            return context;
        }

        var hangar = type.GetProperty("Hangar")?.GetValue(context);
        if (hangar != null)
        {
            return hangar;
        }

        return FindBestHangarMain();
    }

    private static bool TryOpenWithHangarMain(
        global::Spacewood.Unity.MonoBehaviours.Build.HangarMain hangarMain,
        global::Spacewood.Unity.MonoBehaviours.Build.DeckViewer deckViewer,
        ManualLogSource logger)
    {
        try
        {
            logger.LogInfo($"Opening pack viewer through HangarMain.HandleDeckViewerSubmit(DeckViewer); hangar={DescribeComponent(hangarMain)} deckViewer={DescribeComponent(deckViewer)}.");
            hangarMain.HandleDeckViewerSubmit(deckViewer);
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"HangarMain.HandleDeckViewerSubmit(DeckViewer) failed: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static global::Spacewood.Unity.MonoBehaviours.Build.HangarMain FindBestHangarMain()
    {
        return Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.MonoBehaviours.Build.HangarMain>()
            .Where(item => item != null && item.gameObject != null && item.gameObject.scene.IsValid())
            .OrderByDescending(item => item.gameObject.activeInHierarchy)
            .ThenByDescending(item => item.gameObject.activeSelf)
            .FirstOrDefault();
    }

    private static global::Spacewood.Unity.MonoBehaviours.Build.DeckViewer FindBestDeckViewer()
    {
        return Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.MonoBehaviours.Build.DeckViewer>()
            .Where(item => item != null && item.gameObject != null && item.gameObject.scene.IsValid())
            .OrderByDescending(item => item.gameObject.activeInHierarchy)
            .ThenByDescending(item => item.gameObject.activeSelf)
            .FirstOrDefault();
    }

    private static global::Spacewood.Unity.PackShop FindBestPackShop(bool requireActive)
    {
        return Resources.FindObjectsOfTypeAll<global::Spacewood.Unity.PackShop>()
            .Where(item => item != null && item.gameObject != null && item.gameObject.scene.IsValid())
            .Where(item => !requireActive || item.gameObject.activeInHierarchy)
            .OrderByDescending(item => item.gameObject.activeInHierarchy)
            .ThenByDescending(item => item.gameObject.activeSelf)
            .FirstOrDefault();
    }

    private static Component FindBestComponent(string typeName, bool requireScene)
    {
        return Resources.FindObjectsOfTypeAll<Component>()
            .Where(component => IsCandidate(component, typeName, requireScene))
            .OrderByDescending(component => component.gameObject.activeInHierarchy)
            .ThenByDescending(component => component.gameObject.activeSelf)
            .FirstOrDefault();
    }

    private static Component FindBestAssignableComponent(string baseTypeName, bool requireScene)
    {
        return Resources.FindObjectsOfTypeAll<Component>()
            .Where(component => component != null && component.gameObject != null)
            .Where(component => !requireScene || component.gameObject.scene.IsValid())
            .Where(component => HasBaseType(component.GetType(), baseTypeName))
            .OrderByDescending(component => component.gameObject.activeInHierarchy)
            .ThenByDescending(component => component.gameObject.activeSelf)
            .FirstOrDefault();
    }

    private static bool IsCandidate(Component component, string typeName, bool requireScene)
    {
        return component != null
            && component.gameObject != null
            && (!requireScene || component.gameObject.scene.IsValid())
            && component.GetType().FullName == typeName;
    }

    private static bool HasBaseType(Type type, string baseTypeName)
    {
        var current = type;
        while (current != null)
        {
            if (current.FullName == baseTypeName)
            {
                return true;
            }

            current = current.BaseType;
        }

        return false;
    }

    private static bool TryInvokeOneArg(object target, string methodName, string parameterTypeName, object argument, string route, ManualLogSource logger)
    {
        if (target == null)
        {
            return false;
        }

        try
        {
            var method = target.GetType()
                .GetMethods(InstanceFlags)
                .FirstOrDefault(method => method.Name == methodName
                    && method.GetParameters().Length == 1
                    && method.GetParameters()[0].ParameterType.FullName == parameterTypeName);

            if (method == null)
            {
                logger.LogInfo($"Pack-viewer route unavailable: {route}; target={target.GetType().FullName}.");
                return false;
            }

            logger.LogInfo($"Opening pack viewer through {route}; target={DescribeObject(target)} arg={DescribeObject(argument)}.");
            method.Invoke(target, new[] { argument });
            return true;
        }
        catch (Exception ex)
        {
            logger.LogWarning($"Pack-viewer route failed: {route}: {ex.GetType().Name}: {ex.Message}");
            return false;
        }
    }

    private static object TryReadProperty(object target, string propertyName)
    {
        try
        {
            return target.GetType().GetProperty(propertyName, InstanceFlags)?.GetValue(target);
        }
        catch
        {
            return null;
        }
    }

    private static string DescribeObject(object value)
    {
        return value is Component component ? DescribeComponent(component) : value?.GetType().FullName ?? "<null>";
    }

    private static string DescribeComponent(Component component)
    {
        return $"{component.GetType().FullName} active={component.gameObject.activeInHierarchy} path='{ReflectionUtils.GetHierarchyPath(component.gameObject)}'";
    }
}
