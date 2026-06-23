# Settings - Codemap

## Responsibility
Defines all user-configurable settings for the PTT plugin, grouped into categories for the BepInEx ConfigurationManager.

## File-by-File Design

### Config.cs
- **Internal static** class `Config` with four `ConfigEntry<bool>` properties, initialized once via `Init(ConfigFile)`.
- **Section: "0. Advanced"**
  - `SilentMissingInteractableExfilsWarning` (default: `false`) -- Suppresses the warning about missing Interactable Exfils API at game start. Tagged `IsAdvanced = true`.
  - `DebugMode` (default: `false`) -- Development toggle. Tagged `IsAdvanced = true`.
- **Section: "1. Traders"**
  - `ShowLockedTraders` (default: `false`) -- Whether to display locked (unavailable) traders on the trader screen. No advanced tag.
- **Section: "2. Exfiltration"**
  - `ExfilAutoselectCancel` (default: `true`) -- When true, auto-selects the cancel action on the extract prompt so double-F confirms. When false, user must manually select cancel. No advanced tag.
- Every binding uses a `ConfigurationManagerAttributes` tag (from `PTT.Attributes`) for display configuration.

## Flow
- `Config.Init(config)` is called during plugin startup (`Awake`/`Start`) with the BepInEx `ConfigFile`.
- The static properties are then read by other parts of the plugin (e.g., `Helpers.Trader.IsHidden` reads `ShowLockedTraders`).

## Integration
- Read by `PTT.Helpers.Trader` (`ShowLockedTraders`), the plugin core class (all four settings), and any feature that needs configuration branching.
- Serves as the single source of truth for all user-facing configuration. No other config file or provider exists in the project.
