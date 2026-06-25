# Attributes - Codemap

## Responsibility
Contains the `ConfigurationManagerAttributes` class used to decorate BepInEx `ConfigEntry` bindings with display metadata for the ConfigurationManager UI window.

## File-by-File Design

### ConfigurationManagerAttributes.cs
- **Internal sealed** class with nullable properties that mirror the BepInEx ConfigurationManager's setting display options.
- Properties: `ShowRangeAsPercent`, `CustomDrawer`, `CustomHotkeyDrawer`, `Browsable`, `Category`, `DefaultValue`, `HideDefaultButton`, `HideSettingName`, `Description`, `DispName`, `Order`, `ReadOnly`, `IsAdvanced`, `ObjToStr`, `StrToObj`.
- Each property defaults to `null`, meaning "inherit default behavior." Only non-null values override the ConfigurationManager UI.
- Includes a `CustomHotkeyDrawerFunc` delegate signature for hotkey editor drawers.
- Suppressed warnings 0169 (unused field), 0414 (assigned but never used), 0649 (field never assigned to).

## Flow
- Instantiated inline in `Settings/Config.cs` as the tag argument of `ConfigDescription`, e.g.:
  `new ConfigDescription("...", null, new ConfigurationManagerAttributes { IsAdvanced = true, Order = 3 })`
- The ConfigurationManager reads these attributes at runtime to determine how to render each setting.

## Integration
- Directly consumed by `PTT.Settings.Config.Init()` for every config binding.
- No other references within the codebase.
