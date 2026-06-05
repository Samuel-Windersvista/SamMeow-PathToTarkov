using Fika.Core.Networking;

namespace PTT.Fika
{
    /// <summary>
    /// Stores references to Fika components that need to be accessed across the module.
    /// </summary>
    internal static class NetworkManagerStore
    {
        public static IFikaNetworkManager FikaNetworkManager { get; set; } = null;
    }
}