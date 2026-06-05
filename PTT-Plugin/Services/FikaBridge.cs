using System;
using System.Collections.Generic;
using EFT;
using PTT.Data;

namespace PTT.Services
{
    /// <summary>
    /// Bridge for communication between PTT core and Fika module.
    /// Uses events to avoid direct Fika dependencies in the core plugin.
    /// </summary>
    public static class FikaBridge
    {
        // Events for module initialization
        public delegate void SimpleEvent();
        public static event SimpleEvent PluginAwakeEmitted;
        public static event SimpleEvent PluginStartEmitted;
        public static event SimpleEvent RaidStartedEmitted;
        public static event SimpleEvent GameStartedEmitted;

        // Events for Fika status queries
        public delegate bool SimpleBoolReturnEvent();
        public static event SimpleBoolReturnEvent IsHostEmitted;
        public static event SimpleBoolReturnEvent IsClientEmitted;
        public static event SimpleBoolReturnEvent IsDedicatedEmitted;
        public static event SimpleBoolReturnEvent IsHostPlayerEmitted;

        // Events for player information
        public delegate int SimpleIntReturnEvent();
        public static event SimpleIntReturnEvent GetMyPlayerNetIdEmitted;
        
        public delegate List<Player> PlayerListReturnEvent();
        public static event PlayerListReturnEvent GetHumanPlayersEmitted;

        // Events for transit voting
        public delegate void VoteForExfilEvent(ExfilTarget exfilTarget, Action exfilAction);
        public static event VoteForExfilEvent VoteForExfilEmitted;
        
        public delegate void CancelVoteEvent(string cancelMessage);
        public static event CancelVoteEvent CancelVoteForExfilEmitted;
        
        public delegate bool IsTransitDisabledEvent(ExfilTarget exfilTarget);
        public static event IsTransitDisabledEvent IsTransitDisabledEmitted;

        public delegate void SendDisableTransitVoteEvent(string reason);
        public static event SendDisableTransitVoteEvent SendDisableTransitVotePacketEmitted;

        // Events for custom exfil service
        public delegate void TransitToEvent(ExfilTarget exfilTarget);
        public static event TransitToEvent TransitToEmitted;

        // Public methods to trigger events
        public static void PluginAwake() => PluginAwakeEmitted?.Invoke();
        public static void PluginStart() => PluginStartEmitted?.Invoke();
        public static void RaidStarted() => RaidStartedEmitted?.Invoke();
        public static void GameStarted() => GameStartedEmitted?.Invoke();

        public static bool IsHost()
        {
            var result = IsHostEmitted?.Invoke();
            return result ?? false;
        }

        public static bool IsClient()
        {
            var result = IsClientEmitted?.Invoke();
            return result ?? false;
        }

        public static bool IsDedicated()
        {
            var result = IsDedicatedEmitted?.Invoke();
            return result ?? false;
        }

        public static bool IsHostPlayer()
        {
            var result = IsHostPlayerEmitted?.Invoke();
            return result ?? false;
        }

        public static int GetMyPlayerNetId()
        {
            var result = GetMyPlayerNetIdEmitted?.Invoke();
            return result ?? 0;
        }

        public static List<Player> GetHumanPlayers()
        {
            var result = GetHumanPlayersEmitted?.Invoke();
            return result ?? new List<Player>();
        }

        public static void VoteForExfil(ExfilTarget exfilTarget, Action exfilAction)
        {
            VoteForExfilEmitted?.Invoke(exfilTarget, exfilAction);
        }

        public static void CancelVoteForExfil(string cancelMessage)
        {
            CancelVoteForExfilEmitted?.Invoke(cancelMessage);
        }

        public static bool IsTransitDisabled(ExfilTarget exfilTarget)
        {
            var result = IsTransitDisabledEmitted?.Invoke(exfilTarget);
            return result ?? false;
        }

        public static void SendDisableTransitVotePacket(string reason)
        {
            SendDisableTransitVotePacketEmitted?.Invoke(reason);
        }

        public static void TransitTo(ExfilTarget exfilTarget)
        {
            TransitToEmitted?.Invoke(exfilTarget);
        }
    }
}