namespace PTT.Helpers
{
    /// <summary>
    /// Public wrapper for Logger to allow access from Fika module
    /// </summary>
    public static class LoggerPublic
    {
        public static void Info(string message) => Logger.Info(message);
        public static void Warning(string message) => Logger.Warning(message);
        public static void Error(string message) => Logger.Error(message);
        // Debug method doesn't exist in Logger, so we'll use Info for now
        public static void Debug(string message) => Logger.Info($"[DEBUG] {message}");
    }
}