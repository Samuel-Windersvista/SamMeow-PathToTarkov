using EFT;
using EFT.Interactive;
using Comfort.Common;
using System;
using System.Collections.Generic;
using UnityEngine;

using PTT.Helpers;
using PTT.Data;
using PTT.Patches;
using Logger = PTT.Helpers.Logger;

namespace PTT.Services;

public static class CustomExfilService
{
    public static void ExtractTo(ExfiltrationPoint exfil, ExfilTarget exfilTarget)
    {
        // For now, Fika extraction is handled the same as transit
        // The Fika module will handle the actual extraction logic
        if (Plugin.FikaIsInstalled)
        {
            FikaBridge.TransitTo(exfilTarget);
            return;
        }

        LocalGame localGame = Singleton<AbstractGame>.Instance as LocalGame;
        Player player = Singleton<GameWorld>.Instance.MainPlayer;
        Logger.Info($"started extraction on '{exfilTarget.GetCustomExitName()}'");


        if (localGame == null)
        {
            Logger.Error($"cannot extract because no LocalGame found");
            return;
        }

        if (player == null)
        {
            Logger.Error($"cannot extract because no Player found");
            return;
        }

        CurrentExfilTargetService.SaveExfil(exfilTarget);

        // This is needed to validate extract quests like `Burning Rubber`
        // The ptt custom ptt exfil target name will be used to override the exitName in the LocalRaidEndedPatch
        string exitName = exfilTarget.exitName;

        float delay = 0f;
        localGame.Stop(player.ProfileId, ExitStatus.Survived, exitName, delay);
        Logger.Info($"local game stopped for profile '{player.ProfileId}'");
    }

    public static void TransitTo(ExfilTarget exfilTarget, Action onTransitDone)
    {
        if (Plugin.FikaIsInstalled)
        {
            FikaBridge.VoteForExfil(exfilTarget, () =>
            {
                FikaBridge.TransitTo(exfilTarget);
                onTransitDone();
            });
            return;
        }

        TransitPoint transit = Transit.Create(exfilTarget);
        Logger.Info($"started transit on '{transit.parameters.name}'");

        if (!TransitControllerAbstractClass.Exist(out GClass1676 vanillaTransitController))
        {
            Logger.Error($"cannot transit because no TransitControllerAbstractClass found");
            return;
        }

        Player player = Singleton<GameWorld>.Instance.MainPlayer;
        if (player == null)
        {
            Logger.Error($"cannot transit because no player found");
            return;
        }

        CurrentExfilTargetService.SaveExfil(exfilTarget);

        Dictionary<string, ProfileKey> profiles = [];
        profiles.Add(player.ProfileId, new()
        {
            isSolo = true,
            keyId = player.GroupId,
            _id = player.ProfileId,
        });

        string transitHash = Guid.NewGuid().ToString();
        int playersCount = 1;

        vanillaTransitController.Transit(transit, playersCount, transitHash, profiles, player);
        
        // Defer the callback to avoid "ManualUpdate from inside ManualUpdate" error
        if (onTransitDone != null)
        {
            var delayedActionGO = new GameObject("PTT_DelayedAction");
            delayedActionGO.AddComponent<DelayedAction>().Init(onTransitDone);
        }
        
        Logger.Info($"transit done for profile '{player.ProfileId}'");
    }

    public static void CancelTransitVote(string cancelMessage)
    {
        CurrentExfilTargetService.Init();
        if (Plugin.FikaIsInstalled)
        {
            FikaBridge.CancelVoteForExfil(cancelMessage);
        }
    }

    public static bool IsTransitDisabled(ExfilTarget exfilTarget)
    {
        if (Plugin.FikaIsInstalled && exfilTarget.isTransit)
        {
            return FikaBridge.IsTransitDisabled(exfilTarget);
        }
        return false;
    }
}
