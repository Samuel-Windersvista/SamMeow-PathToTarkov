# PTT-Plugin/Patches/

## Responsibility

The `Patches/` folder contains all Harmony `ModulePatch` subclasses that intercept SPT/Aki game methods to inject PathToTarkov behavior. Every patch targets a specific game method (via `GetTargetMethod`) and applies either a `[PatchPrefix]` (runs before the original, can skip it) or `[PatchPostfix]` (runs after the original). Collectively they:

- Replace the game's exfiltration point initialization with PTT's per-location filtering logic.
- Override vanilla exfil UI tooltip text to show PTT-specific destination maps/traders.
- Force scav-only exfiltration points to accept PMC players.
- Suppress/hide locked traders from trader panels/cards.
- Capture raid lifecycle events (`LocalRaidStarted`, `LocalRaidEnded`, `OnGameStarted`) to initialize/reset PTT data services.
- Display version-mismatch warnings on the main menu.
- Increase UI container sizes to prevent clipping with PTT's larger exfil lists.
- Add compatibility with Kaeno's TraderScrolling mod when hidden traders shift card layout.

---

## Design

### Base class
All patches inherit from `SPT.Reflection.Patching.ModulePatch`. Each must override `GetTargetMethod()` returning a `MethodBase` to hook, and can define `[PatchPrefix]` / `[PatchPostfix]` static methods. Patches are instantiated and `.Enable()`-d in `Plugin.Awake()` (lines 57-81).

### Key abstractions

| Concept | Implemented by |
|---|---|
| PTT per-location exfil filter | `CurrentLocationDataService` (services layer), invoked by `InitAllExfiltrationPointsPatch` and `ExfiltrationPointAwakePatch` |
| Custom tooltip text | `ExfilTooltip` (UI layer) reads `CurrentLocationDataService.GetExfilTargets()` and renders connected maps/traders |
| Exit name override | `CurrentExfilTargetService` — stores the player's chosen exfil target, consumed by `LocalRaidEndedPatch` to stamp `results.exitName` |
| IEAPI integration | `ExfilPromptService` (services layer) replaces IEAPI prompt logic, wrapped in `IEApiWrapper` |
| ScavExtract -> PMC bridge | `ScavExfiltrationPointPatch` forces `InfiltrationMatch` to true |
| Trader hiding | `HideLockedTraderPanelPatch` / `HideLockedTraderCardPatch` hide untradable traders from trader UI |

### Two-phase exfil filtering

Exfil filtering runs in **two phases** to solve a timing problem:

1. **Phase 1** — `InitAllExfiltrationPointsPatch.Postfix` fires when the game calls `InitAllExfiltrationPoints`. At this point `CurrentLocationDataService` is not yet initialized (no HTTP response from the PTT server). The patch merges all PMC + unique scav exfils into the controller, loads their settings, then calls `TryApplyExfilFiltering()` which is a no-op if data service isn't ready.

2. **Phase 2** — `Plugin.RaidStarted()` (called from `LocalRaidStartedPatch`) invokes `CurrentLocationDataService.Init()` which does the HTTP fetch. After that succeeds, it calls `ExfiltrationPointAwakePatch.DisableInvalidExfils()` and `InitAllExfiltrationPointsPatch.ApplyExfilFiltering()` to finally cull disabled exfils and re-bind the controller's point list.

This means the first frame or two of a raid may briefly show all exfils, then they snap to the filtered set.

### Patch suppression patterns

- **Full suppression** — `ExitTimerPanelSetTimerTextActivePatch.Prefix` returns `false` (skip original). The original `SetTimerTextActive` is completely disabled because PTT manages visibility through `UpdateVisitedStatus`.
- **Partial override** — `ExitTimerPanelUpdateVisitedStatusPatch.Postfix` runs after the original; it overwrites the text fields `_pointName`, `_pointStatusLabel`, and conditionally enables `_itemsObject`.
- **Forced return** — `ScavExfiltrationPointPatch.Prefix` sets `__result = true` and returns `false`, short-circuiting the game's infiltration-match check.

### Cross-patch static coupling

Patches share state through static fields:

| Static field | Read by | Written by |
|---|---|---|
| `ExfiltrationPointAwakePatch.TrackedExfils` | `DisableInvalidExfils()` | `PatchPostfix` on each `Awake` |
| `InitAllExfiltrationPointsPatch._cachedController/LocationId/Settings/GiveAuthority` | `ApplyExfilFiltering()` | `PatchPostfix` |
| `ExtractionTimersPanelSwitchTimersPatch.ShowOnePoint` | `ExitTimerPanelUpdateVisitedStatusPatch` | `SwitchTimersPatch.Prefix` |

This is a pragmatic pattern: the first patch that runs caches game state, and a later entry point reuses it.

---

## Flow

### Raid lifecycle (init -> gameplay -> end)

```
                         Plugin.Awake()
                              |
        Register all patches via .Enable()  (lines 57-81)
                              |
                    MenuScreen.Awake()
                    [MenuScreenAwakePatch]
                    -> version warnings
                              |
                    (user starts raid)
                              |
   Class303.LocalRaidStarted()
   [LocalRaidStartedPatch]
        |                                    
        +-> stores LocalRaidSettings in LocalRaidSettingsRetriever
        +-> awaits Task<LocalSettings>, stores LocalSettings
        +-> Plugin.RaidStarted()
              |
              +-> CurrentLocationDataService.Init()
              |     +-> HTTP fetch exfil targets from PTT server
              |     +-> _isInitialized = true
              |     +-> InitAllExfiltrationPointsPatch.TryApplyExfilFiltering()
              |
              +-> ExfiltrationPointAwakePatch.DisableInvalidExfils()
              +-> InitAllExfiltrationPointsPatch.ApplyExfilFiltering()
              +-> CurrentExfilTargetService.Init()
              |
   (scene loads, exfils Awake)
   [ExfiltrationPointAwakePatch]
        +-> tracks all ExfiltrationPoint instances
                              |
   ExfiltrationControllerClass.InitAllExfiltrationPoints()
   [InitAllExfiltrationPointsPatch]
        +-> Phase 1: merge scav+PMC exfils, store controller ref
        +-> TryApplyExfilFiltering() (no-op if data not ready)
                              |
   GameWorld.OnGameStarted()
   [OnGameStartedPatch]
        +-> Plugin.GameStarted() -> version checks
                              |
   (raid gameplay - exfil interaction)
   [ScavExfiltrationPointPatch]
        +-> InfiltrationMatch always true (PMC can use scav extracts)
                              |
   (extraction timers UI)
   [ExtractionTimersPanel][ExitTimerPanel]
        +-> ShowOnePoint tracked via SwitchTimersPatch
        +-> Custom tooltip text via UpdateVisitedStatusPatch
        +-> PointsMask enlarged via ExtractionTimersPanelAwakePatch
                              |
   Class303.LocalRaidEnded()
   [LocalRaidEndedPatch]
        +-> Consume custom exit name, stamp results.exitName
        +-> Plugin.RaidEnded()
              +-> CurrentLocationDataService.Reset()
              +-> ClearTrackedExfils()
```

### Exfil filtering decision tree

```
For each ExfiltrationPoint in scene:
  ├─ Is it a ScavExfiltrationPoint (and not SharedExfiltrationPoint)?
  │   └─ YES: included only if name not already in PMC list AND enabled in PTT config
  └─ NO (PMC exfil): included only if enabled in PTT config
  
Then for each included exfil: LoadSettings(locationExit) binds correct config
Then for each excluded exfil:
  1. Destroy CustomExfilTrigger components (IEAPI)
  2. exfil.enabled = false
  3. All colliders disabled
  4. Status = NotPresent
  5. gameObject.SetActive(false)
```

### UI tooltip rendering

```
ExitTimerPanel.UpdateVisitedStatus() [Phostfix]
  -> Read _pointName, _pointStatusLabel, _itemsToBringLabel, _itemsObject via reflection
  -> Build ExfilTooltip(exfilPoint)
  -> _pointName.text = ExfilTooltip.GetPrimaryText()    (localized exfil name)
  -> _pointStatusLabel.text = ExfilTooltip.GetSecondaryText()  (maps + traders)
  -> If one point visible (ExtractionTimersPanelSwitchTimersPatch.ShowOnePoint):
       _itemsToBringLabel.text = requirements texts
       _itemsObject.SetActive(true)
     Else:
       _itemsObject.SetActive(false)
```

---

## Integration

### Patch inventory

| File | Class(es) | Target method | Type | Purpose |
|---|---|---|---|---|
| `ExfiltrationPointAwakePatch.cs` | `ExfiltrationPointAwakePatch` | `ExfiltrationPoint.Awake()` (non-public) | Postfix | Track all exfil instances; static `DisableInvalidExfils()` called later to cull disabled ones |
| `InitAllExfiltrationPointsPatch.cs` | `InitAllExfiltrationPointsPatch` | `ExfiltrationControllerClass.InitAllExfiltrationPoints()` | Postfix | Phase-1 exfil merge + binding; static `ApplyExfilFiltering()` called from `RaidStarted()` for Phase-2 culling |
| `ScavExfiltrationPointPatch.cs` | `ScavExfiltrationPointPatch` | `ScavExfiltrationPoint.InfiltrationMatch()` | Prefix (skip orig) | Always return `true` so PMCs can use scav extracts |
| `OnGameStartedPatch.cs` | `OnGameStartedPatch` | `GameWorld.OnGameStarted()` | Postfix | Fire `Plugin.GameStarted()` for version checks |
| `LocalRaidStartedPatch.cs` | `LocalRaidStartedPatch` | `Class303.LocalRaidStarted()` | Postfix | Capture `LocalRaidSettings` / `LocalSettings`; trigger `Plugin.RaidStarted()` |
| `LocalRaidEndedPatch.cs` | `LocalRaidEndedPatch` | `Class303.LocalRaidEnded()` | Prefix | Stamp custom exit name on results; trigger `Plugin.RaidEnded()` |
| `MenuScreenAwakePatch.cs` | `MenuScreenAwakePatch` | `MenuScreen.Awake()` | Postfix | Display version-mismatch warnings in main menu |
| `ExitTimerPanelPatch.cs` | `ExitTimerPanelSetTimerTextActivePatch` | `ExitTimerPanel.SetTimerTextActive()` | Prefix (skip orig) | Suppress default timer-text visibility; PTT manages this via `UpdateVisitedStatus` |
| | `ExitTimerPanelUpdateVisitedStatusPatch` | `ExitTimerPanel.UpdateVisitedStatus()` | Postfix | Overwrite UI text with PTT tooltip data (maps, traders, requirements) |
| `ExtractionTimersPanelPatch.cs` | `ExtractionTimersPanelSwitchTimersPatch` | `ExtractionTimersPanel.SwitchTimers()` | Prefix | Capture `showOnePoint` into static flag used by `ExitTimerPanel` patch |
| | `ExtractionTimersPanelAwakePatch` | `ExtractionTimersPanel.Awake()` | Postfix | Increase `PointsMask` height to prevent clipping with many exfils |
| `HideLockedTraderPatch.cs` | `HideLockedTraderPanelPatch` | `TraderPanel.Show()` | Postfix | Hide trader panel if trader is hidden in PTT config |
| | `HideLockedTraderCardPatch` | `TraderCard.Show()` | Postfix | Hide trader card if trader is hidden in PTT config |
| `KaenoTraderScrollingCompatPatch.cs` | `KaenoTraderScrollingCompatPatch` | `TraderScreensGroup.Show()` | Postfix | Attach `KaenoTraderScrollingCompatScript` to `Menu UI` GameObject to adjust card anchors when PTT hides traders |

### Dependencies on other PTT modules

- **`Plugin.CurrentLocationDataService`** (`Services/CurrentLocationDataService.cs`) — All exfil-related patches read from this to determine which exfils/traders are enabled.
- **`Plugin.RaidStarted()` / `Plugin.RaidEnded()` / `Plugin.GameStarted()`** — Central lifecycle hooks defined in `Plugin.cs` that orchestrate service init/reset.
- **`Services.CurrentExfilTargetService`** — `LocalRaidEndedPatch` consumes its `ConsumeExitName()`.
- **`Services.LocalRaidSettingsRetriever`** — `LocalRaidStartedPatch` populates it; `CurrentLocationDataService` reads `RaidSettings.location` from it.
- **`Services.IEApiWrapper` / `Services.ExfilPromptService`** — Cleared during filter re-application to avoid stale prompts.
- **`UI.ExfilTooltip`** — Consumed by `ExitTimerPanelUpdateVisitedStatusPatch` to render custom tooltip text.
- **`Helpers.Logger`** — All patches log through the shared helper.
- **`Helpers.Trader.IsHidden(ref Profile.TraderInfo)`** — Used by `HideLockedTrader*Patch` classes.
- **`Scripts.KaenoTraderScrollingCompatScript`** — MonoBehaviour attached by `KaenoTraderScrollingCompatPatch`.

### Dependencies on external mods

- **SPT.Reflection.Patching** — `ModulePatch` base class, Harmony wrapper.
- **Interactable Exfils API** (`Jehree.InteractableExfilsAPI`) — Optional dependency. `ExfiltrationPointAwakePatch.DisableInvalidExfils()` destroys `CustomExfilTrigger` components; `ExfilPromptService` integrates with `InteractableExfilsService`.
- **Kaeno.TraderScrolling** — Optional. `KaenoTraderScrollingCompatPatch` is only enabled when `Chainloader.PluginInfos` contains `"com.kaeno.TraderScrolling"`.
- **Fika.Core** (`com.fika.core`) — Optional. `FikaBridge` calls are scattered through `Plugin` lifecycle methods but the patches themselves are Fika-agnostic.

### Registration order sensitivity

Patches are registered in a specific order in `Plugin.Awake()` (lines 57-81):

1. `HideLockedTraderCardPatch` / `HideLockedTraderPanelPatch` — no timing dependency
2. `ExfiltrationPointAwakePatch` — must be registered before scene objects start Awaking
3. `InitAllExfiltrationPointsPatch` — must be ready for the game's `InitAllExfiltrationPoints` call
4. `ScavExfiltrationPointPatch` — no timing dependency
5. `OnGameStartedPatch` — no timing dependency
6. `LocalRaidStartedPatch` / `LocalRaidEndedPatch` — no timing dependency
7. `MenuScreenAwakePatch` — no timing dependency
8. `ExitTimerPanel*Patch` / `ExtractionTimersPanel*Patch` — no timing dependency

The critical ordering is #2 before #3: exfils must be tracked via `Awake` before the controller tries to initialize them. `HideLockedTrader*` patches run first but are independent.

### Potential issues / notes

- **Race condition in two-phase filtering**: between Phase 1 (game init) and Phase 2 (PTT data service ready), there is a window where all exfils are visible and the controller's `ExfiltrationPoints` includes points that should be disabled. The `TryApplyExfilFiltering` guard (`if _cachedController == null || DataService == null || !DataService.IsInitialized()`) exits early, so nothing breaks — but the UI briefly shows all extracts.
- **`ExfiltrationPointAwakePatch.DisableInvalidExfils()` duplicates logic**: It calls `exfil.enabled = false`, disables colliders, sets `NotPresent`, and deactivates the GameObject. `InitAllExfiltrationPointsPatch.ApplyExfilFiltering()` does the exact same sequence. This means disabled exfils get hammered twice — harmless but redundant.
- **Static mutable state**: `TrackedExfils` is a static `List<ExfiltrationPoint>` that lives across raids. `ClearTrackedExfils()` is called in `Plugin.RaidEnded()`, but if a raid errors before `RaidEnded` fires, the list may retain stale references. The `exfil == null` guard in `DisableInvalidExfils` mitigates this for null references but not for destroyed-Object-pointers (Unity fake-null).
- **`Class303` is an obfuscated type**: The `LocalRaidStarted` / `LocalRaidEnded` patches reference `Class303` directly — this is a SPT obfuscated class name and will need updating when SPT obfuscation changes between versions.
- **`ExitTimerPanelUpdateVisitedStatusPatch` uses reflection-heavy field access**: Every call reads `_point`, `_pointName`, `_pointStatusLabel`, `_itemsToBringLabel`, `_itemsObject` via `typeof(ExitTimerPanel).GetField(..., NonPublic|Instance)`. This is fragile across game updates if those field names change.
- **`ExtractionTimersPanelAwakePatch` hardcodes UI path**: The path `MainContainer/MainTimer/PointsMask` is a string literal. If the Unity UI hierarchy changes, this silently fails (logged as error, patch does nothing).
