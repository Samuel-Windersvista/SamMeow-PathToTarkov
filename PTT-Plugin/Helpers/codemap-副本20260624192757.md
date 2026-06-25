# Helpers - Codemap

## Responsibility
Provides utility, logging, networking, and UI helper classes used across the PTT plugin. 10 files, all in `PTT.Helpers` namespace.

## File-by-File Design

### Logger.cs
- **Internal** static wrapper around BepInEx `ManualLogSource`.
- `Init(ManualLogSource)` stores the logger reference (called once at plugin startup).
- `Info`, `Warning`, `Error` methods prefix messages with `[PTT]`, `[PTT] Warning:`, `[PTT] Error:` before forwarding to BepInEx.

### LoggerPublic.cs
- **Public** static class mirroring Logger so the Fika module can log without internal access.
- `Debug` is a shim that calls `Logger.Info("[DEBUG] ...")` since the internal Logger has no Debug method.

### HttpRequest.cs
- **Internal** static class communicating with the SPT server backend via `SPT.Common.Http.RequestHandler`.
- `FetchCurrentLocationData(string locationId)` -- POSTs to `/PathToTarkov/CurrentLocationData` with a JSON body containing the location ID, deserializes the `CurrentLocationDataResponse`.
- `FetchVersionData()` -- POSTs `{}` to `/PathToTarkov/Version`, returns `VersionDataResponse` or null on failure. Wraps exceptions and logs errors.

### Transit.cs
- **Public** static helper that creates a `TransitPoint` from an `ExfilTarget`.
- Copies `transitMapId` into `.parameters.location` and the custom exit name into `.parameters.name/.description`.
- Returns a fully-constructed `TransitPoint` with Enabled/IsActive = true.

### Trader.cs
- **Internal** static helper that checks whether a trader should be hidden in the UI.
- Logic: `Settings.Config.ShowLockedTraders` is false AND `trader.Unlocked` is false => hidden.

### Player.cs
- **Internal** static class `PlayerProfile` with a single method `GetLevel()`.
- Accesses `GameWorld.Instance.MainPlayer.Profile.Info.Level` via singleton.

### Sound.cs
- **Internal** static class wrapping BepInEx `GUISounds.PlayUISound`.
- `PlayMenuEnter()` -> `MenuCheckBox`
- `PlayMenuCancel()` -> `MenuDropdownSelect`
- `PlayExtractConfirm()` / `PlayTransitConfirm()` -> `ChatSelect`

### DelayedAction.cs
- **Public** `MonoBehaviour` component that executes a deferred action on the next `Update()` frame.
- Created and attached to a GameObject to break deep call stacks / recursion.
- The action fires once, then `Destroy(gameObject)` runs immediately after.
- Pattern: "schedule something for next frame to avoid in-stack recursion."

### ColorUtils.cs
- **Public** static converter from `System.Drawing.Color` to `UnityEngine.Color`.
- Simply divides each channel (R, G, B, A) by 255f.

### StringUtils.cs
- **Public** static utility for string casing.
- `Capitalize(input)` -- uppercases the first character; no-op on null/empty.
- `Titleize(input)` -- lowercases the whole string first, then calls Capitalize.

## Flow
- `Logger.Init()` is called once in the plugin's `Awake` / `Start`. All other helpers depend on it indirectly through `HttpRequest` and `LoggerPublic`.
- `HttpRequest` is the only outward-facing networking helper; called from plugin core to fetch exfil/version data from the SPT server.
- `Transit`, `Trader`, `Player`, `Sound`, `DelayedAction`, `ColorUtils`, `StringUtils` are leaf utilities with no dependencies on each other.

## Integration
- These helpers are consumed by the main plugin class(es) in `PTT.Plugin` and optionally by the Fika module via `LoggerPublic`.
- `DelayedAction` is attached as a Unity component at runtime; not present in any prefab.
