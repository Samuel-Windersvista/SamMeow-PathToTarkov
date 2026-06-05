using Comfort.Common;
using Fika.Core.Coop.Components;
using Fika.Core.Coop.Players;
using Fika.Core.Coop.Utils;
using Fika.Core.Networking;
using PTT.Services;
using PTT.Fika.Services;
using System.Collections.Generic;
using System.Linq;
using EFT;

namespace PTT.Fika
{
    /// <summary>
    /// Main entry point for the PTT Fika module.
    /// Called via reflection from the core plugin when Fika is detected.
    /// </summary>
    public class Main
    {
        // Called by the core plugin via reflection
        public static void Init()
        {
            // Subscribe to events from the core plugin
            FikaBridge.PluginAwakeEmitted += OnPluginAwake;
            FikaBridge.PluginStartEmitted += OnPluginStart;
            FikaBridge.RaidStartedEmitted += OnRaidStarted;
            FikaBridge.GameStartedEmitted += OnGameStarted;

            // Hook up Fika status queries
            FikaBridge.IsHostEmitted += IsHost;
            FikaBridge.IsClientEmitted += IsClient;
            FikaBridge.IsDedicatedEmitted += IsDedicated;
            FikaBridge.IsHostPlayerEmitted += IsHostPlayer;

            // Hook up player information
            FikaBridge.GetMyPlayerNetIdEmitted += GetMyPlayerNetId;
            FikaBridge.GetHumanPlayersEmitted += GetHumanPlayers;

            // Hook up transit voting
            FikaBridge.VoteForExfilEmitted += TransitVoteService.VoteForExfil;
            FikaBridge.CancelVoteForExfilEmitted += TransitVoteService.CancelVoteForExfil;
            FikaBridge.IsTransitDisabledEmitted += TransitVoteService.IsTransitDisabled;
            FikaBridge.SendDisableTransitVotePacketEmitted += TransitVoteService.SendDisableTransitVotePacket;

            // Hook up custom exfil service
            FikaBridge.TransitToEmitted += (exfilTarget) =>
            {
                // Determine if this is an extract or transit based on exfilTarget
                if (exfilTarget.isTransit)
                {
                    PTT.Fika.Services.CustomExfilService.TransitTo(exfilTarget);
                }
                else
                {
                    // For extraction, we need to find the exfil point
                    // This is a simplified approach - in reality, we'd need to pass the exfil point
                    PTT.Fika.Services.CustomExfilService.ExtractTo(null, exfilTarget);
                }
            };
        }

        private static void OnPluginAwake()
        {
            TransitVoteService.Init();
        }

        private static void OnPluginStart()
        {
            // Any Fika-specific initialization that needs to happen at plugin start
        }

        private static void OnRaidStarted()
        {
            TransitVoteService.OnRaidStarted();
        }

        private static void OnGameStarted()
        {
            TransitVoteService.OnGameStarted();
        }

        // Fika status methods
        private static bool IsHost()
        {
            return Singleton<FikaServer>.Instantiated;
        }

        private static bool IsClient()
        {
            return Singleton<FikaClient>.Instantiated;
        }

        private static bool IsDedicated()
        {
            var groupId = FikaBackendUtils.Profile?.Info?.GroupId;
            return FikaBackendUtils.IsServer && (groupId == "DEDICATED" || groupId == "HEADLESS");
        }

        private static bool IsHostPlayer()
        {
            return IsHost() && !IsDedicated();
        }

        // Player information methods
        private static int GetMyPlayerNetId()
        {
            var coopHandler = GetCoopHandler();
            if (coopHandler?.MyPlayer == null)
            {
                Helpers.LoggerPublic.Error("(FIKA) GetPlayerNetId: no CoopHandler.MyPlayer, fallback to 0");
                return 0;
            }

            return coopHandler.MyPlayer.NetId;
        }

        private static List<Player> GetHumanPlayers()
        {
            var coopHandler = GetCoopHandler();
            if (coopHandler == null)
            {
                Helpers.LoggerPublic.Error("GetHumanPlayers cannot retrieve the CoopHandler");
                return new List<Player>();
            }

            List<CoopPlayer> humanPlayers = new List<CoopPlayer>();

            // HumanPlayers is a field in Fika version <= 1.1.4.0
            var humanPlayersField = coopHandler.GetType().GetField("HumanPlayers");
            var humanPlayersProperty = coopHandler.GetType().GetProperty("HumanPlayers");
            
            if (humanPlayersField != null)
            {
                Helpers.LoggerPublic.Info("HumanPlayers: field detected");
                humanPlayers = (List<CoopPlayer>)humanPlayersField.GetValue(coopHandler) ?? new List<CoopPlayer>();
            }
            else if (humanPlayersProperty != null)
            {
                Helpers.LoggerPublic.Info("HumanPlayers: property detected");
                humanPlayers = (List<CoopPlayer>)humanPlayersProperty.GetValue(coopHandler) ?? new List<CoopPlayer>();
            }
            else
            {
                Helpers.LoggerPublic.Error("HumanPlayers: no property or field detected on CoopHandler");
                humanPlayers = new List<CoopPlayer>();
            }

            Helpers.LoggerPublic.Info($"GetHumanPlayers: Found {humanPlayers.Count} total players before filtering");

            var filteredHumanPlayers = humanPlayers.Where(player =>
            {
                var profileId = player?.Profile?.ProfileId ?? "Unknown";
                var nickname = player?.Profile?.Nickname ?? "Unknown";
                var groupId = player?.Profile?.Info?.GroupId ?? "Unknown";
                var isAI = player?.IsAI ?? false;
                
                Helpers.LoggerPublic.Info($"Player check: ProfileId={profileId}, Nickname={nickname}, GroupId={groupId}, IsAI={isAI}");

                // Always filter out dedicated/headless servers - they shouldn't participate in voting
                if (groupId == "DEDICATED" || groupId == "HEADLESS")
                {
                    Helpers.LoggerPublic.Info($"Filtering out dedicated/headless server: {profileId}");
                    return false;
                }

                // Filter out AI players if any
                if (isAI)
                {
                    Helpers.LoggerPublic.Info($"Filtering out AI player: {profileId}");
                    return false;
                }

                Helpers.LoggerPublic.Info($"Including human player: {profileId}");
                return true;
            });

            var filteredList = filteredHumanPlayers.Cast<Player>().ToList();
            Helpers.LoggerPublic.Info($"GetHumanPlayers: Returning {filteredList.Count} human players after filtering");
            return filteredList;
        }

        private static CoopHandler GetCoopHandler()
        {
            var networkManager = GetNetworkManager();
            return networkManager?.CoopHandler;
        }

        private static IFikaNetworkManager GetNetworkManager()
        {
            if (NetworkManagerStore.FikaNetworkManager != null)
            {
                return NetworkManagerStore.FikaNetworkManager;
            }

            Helpers.LoggerPublic.Warning("FikaNetworkManager not set, trying to fallback on singleton");
            return Singleton<IFikaNetworkManager>.Instance;
        }
    }
}