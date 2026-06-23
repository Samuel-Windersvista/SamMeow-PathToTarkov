# PTT-Plugin/

## Responsibility

Client-side BepInEx plugin for the Path To Tarkov (PTT) mod. It patches Escape From Tarkov at runtime to implement a server-driven open-world extraction/transit system. Responsibilities:

- **Server-driven exfil filtering**: Communicates with the PTT server mod via HTTP to discover which exfiltration points are valid for the current raid location and which extraction targets (off-raid positions / transit maps) they lead to.
- **Custom exfil interaction UI**: Integrates with Jehree's InteractableExfilsAPI to replace vanilla extraction prompts with multi-step menus that let players choose a destination.
- **Custom extraction/transit execution**: Calls EFT's internal `LocalGame.Stop()` or `TransitControllerAbstractClass.Transit()` with server-supplied destination data.
- **Raid lifecycle hooks**: Captures raid settings, orchestrates service initialization at raid start, and overrides exit names at raid end so quests like "Burning Rubber" validate correctly.
- **Version gating**: Compares client plugin version against the server mod version; shows in-game notifications on mismatch.
- **Trader UI filtering**: Optionally hides locked trader cards/panels in the trader screen.
- **Fika co-op support**: Provides an event-based bridge (`FikaBridge`) that the optional `PTT-Fika` satellite assembly hooks into for multiplayer extraction voting and transit sync.

## Design

### Architecture Diagram (Logical Layers)

```
Plugin (entry point)
  |-- Services/          (orchestration + business logic)
  |-- Patches/           (Harmony/SPT Reflection patches on EFT internals)
  |-- UI/                (exfil prompt + tooltip rendering)
  |-- Data/              (DTOs shared with server)
  |-- Helpers/           (utilities: HTTP, logging, sound, etc.)
  |-- Settings/          (BepInEx config bindings)
  |-- Attributes/        (ConfigurationManager attribute helpers)
  |-- Scripts/           (Unity MonoBehaviours)
```

### Key Patterns

**1. ModulePatch via SPT.Reflection.Patching (20 patches)**
Every patch inherits from `ModulePatch`, overrides `GetTargetMethod()` (returning the target EFT method via reflection), and applies `[PatchPrefix]` / `[PatchPostfix]`. This is the standard SPT patch pattern, using ABI-compatible reflection rather than Harmony annotations directly.

**2. Event-based Fika Bridge (decoupled integration)**
`FikaBridge` exposes C# events rather than direct method calls. The optional `PTT-Fika` assembly subscribes to these events at runtime (loaded via reflection in `Plugin.TryInitFikaModule()`). This keeps the core plugin dependency-free from Fika; the bridge simply no-ops if no subscriber exists.

**3. Two-phase Exfil Filtering**
Exfils cannot be filtered at init time because the HTTP call to the server (`CurrentLocationDataService`) is async and competes with EFT's own exfil initialization. The system uses a two-phase approach:
- **Phase 1** (`InitAllExfiltrationPointsPatch.PatchPostfix`): Loads all exfils unfiltered, stores a reference to the controller + settings, then calls `TryApplyExfilFiltering()`.
- **Phase 2** (`CurrentLocationDataService.Init()` -> `ApplyExfilFiltering()`): Once the HTTP response arrives, replaces `controller.ExfiltrationPoints` with a filtered list and disables all non-matching exfil GameObjects (colliders off, status = `NotPresent`, GameObject inactive).

**4. Stateful ExfilPrompt (multi-step interaction)**
`ExfilPrompt` is per-exfil and maintains a state machine:
- State 0: Action selection (list of extract/transit targets from server)
- State 1: Confirmation (confirm or cancel)
- State 2: Post-vote (cancel only, for Fika transit votes)
Each state returns an `OnActionsAppliedResult` consumed by IE API. The prompt also handles vote cancellation when the player exits the zone.

**5. Exit Name Override via ConsumeExitName()**
After a PTT extraction/transit, the destination is stored in `CurrentExfilTargetService`. `LocalRaidEndedPatch` reads (and consumes) this value in its prefix to override `results.exitName`, ensuring quest validation sees the correct exit name.

### Assembly Dependencies (csproj)
- **Framework**: net471
- **EFT/SPT references**: `Assembly-CSharp`, `spt-common`, `spt-reflection`, `Comfort`, `Comfort.Unity`, `Newtonsoft.Json`, `Sirenix.Serialization`
- **Unity**: `UnityEngine`, `UnityEngine.CoreModule`, `UnityEngine.UI`, `UnityEngine.UIModule`, `UnityEngine.PhysicsModule`, `Unity.TextMeshPro`
- **Modding**: `BepInEx`, `0Harmony`, `DissonanceVoip`
- **IE API**: `InteractableExfilsAPI` (hard dependency at runtime)
- **Internal shared**: `PTT-Packets` project reference
- **Fika**: Soft dependency (detected via `Chainloader.PluginInfos`; the `PTT-Fika` assembly is loaded by name)

### Configuration (BepInEx Config)
| Key | Section | Default | Description |
|-----|---------|---------|-------------|
| Silent Missing Interactable Exfils API Warning | Advanced | false | Suppress warning if IE API is missing |
| Development Mode | Advanced | false | Dev-only extras (e.g. `*` on Sandbox High) |
| Show locked traders | Traders | false | Show/hide locked trader cards |
| Autoselect the cancel action | Exfiltration | true | When true, cancel is first in the confirmation list |

## Flow

### Startup Sequence

```
Plugin.Awake()
  |-- Logger.Init()
  |-- FetchPathToTarkovServerVersion()
  |     |-- HTTP POST /PathToTarkov/Version
  |     |-- If null/uninstalled -> PathToTarkovIsDisabled = true (early return)
  |-- Settings.Config.Init()
  |-- Detect Fika + IE API via Chainloader.PluginInfos
  |-- new CurrentLocationDataService()
  |-- Register KaenoTraderScrollingCompatPatch (if Kaeno mod present)
  |-- Register all 12 patches
  |-- TryInitFikaModule() -> Assembly.Load("PTT-Fika") via reflection
  |-- FikaBridge.PluginAwake()

Plugin.Start()
  |-- Validate Fika version (>= 1.1.5)
  |-- Validate IE API version (>= 2.0.0)
  |-- IEApiWrapper.Init() -> ExfilPromptService(ieService).Init()
  |     |-- ieService.DisableVanillaActions = true
  |     |-- Subscribe to ieService.OnActionsAppliedEvent
  |-- FikaBridge.PluginStart()
```

### Raid Lifecycle

```
Raid begins (player clicks "Next")
  |-- LocalRaidStartedPatch (Class303.LocalRaidStarted)
  |     |-- Store LocalRaidSettings in LocalRaidSettingsRetriever
  |     |-- Await LocalSettings task (captured for later use)
  |     |-- Plugin.RaidStarted()

Plugin.RaidStarted()
  |-- FikaBridge.RaidStarted()
  |-- CurrentLocationDataService.Init()
  |     |-- HTTP POST /PathToTarkov/CurrentLocationData { locationId }
  |     |-- Returns Dictionary<string, List<ExfilTarget>> indexed by exit name
  |     |-- InitAllExfiltrationPointsPatch.TryApplyExfilFiltering()
  |           |-- Phase 2: replace controller.ExfiltrationPoints with filtered list
  |           |-- Disable non-matching exfil GameObjects
  |-- Clear IE API prompt cache
  |-- ExfiltrationPointAwakePatch.DisableInvalidExfils()
  |     |-- Destroy CustomExfilTrigger components on disabled exfils
  |-- InitAllExfiltrationPointsPatch.ApplyExfilFiltering()
  |-- CurrentExfilTargetService.Init()
  |-- DisplayOutdatedVersionsWarnings()

GameWorld.OnGameStarted()
  |-- OnGameStartedPatch -> Plugin.GameStarted()
  |     |-- FikaBridge.GameStarted()
  |     |-- DisplayOutdatedVersionsWarnings()

MenuScreen.Awake()
  |-- MenuScreenAwakePatch -> Plugin.DisplayOutdatedVersionsWarnings()
```

### Exfil Interaction Flow

```
Player enters exfil zone
  |-- IE API fires OnActionsAppliedEvent
  |-- ExfilPromptService.RequiresManualActivation()
  |     |-- Sets RequiresManualActivation = true
  |-- ExfilPromptService.ExfilPromptHandler()
  |     |-- If exfil disabled by PTT config -> return empty actions (no interaction)
  |     |-- Get or create ExfilPrompt for this exit name
  |     |-- ExfilPrompt.Render()

ExfilPrompt.Render() state machine:
  [State 0 - Action Selection]
  |-- Get List<ExfilTarget> from CurrentLocationDataService
  |-- For each target:
  |     |-- Transit: CreateCustomExfilAction -> CustomExfilService.TransitTo(target, callback)
  |     |-- Extract: CreateCustomExfilAction -> CustomExfilService.ExtractTo(exfil, target)
  |-- Return OnActionsAppliedResult(actions, OnExitZone)

  Player selects an action:
  |-- Sound.PlayMenuEnter()
  |-- Enters [State 1 - Confirmation]

  [State 1 - Confirmation]
  |-- Show confirm + cancel (order depends on ExfilAutoselectCancel config)
  |-- Confirm -> execute stored action
  |-- Cancel -> CancelVote + InitPromptState()

  After confirm (transit with Fika):
  |-- Enters [State 2 - Post-vote] (cancel only)
  |-- When vote completes or zone is exited -> cleanup

OnExitZone:
  |-- If voted but not exfiltrated -> CancelVote("Vote cancelled (zone exited)")
```

### Extraction/Transit Execution

```
Extract (solo):
  CustomExfilService.ExtractTo(exfil, target)
    |-- Save target to CurrentExfilTargetService
    |-- localGame.Stop(playerId, Survived, exitName, 0f)
    |-- LocalRaidEndedPatch.Prefix consumes exitName -> overrides results.exitName

Transit (solo):
  CustomExfilService.TransitTo(target, onDone)
    |-- Save target to CurrentExfilTargetService
    |-- Create TransitPoint via Helpers.Transit.Create(target)
    |-- vanillaTransitController.Transit(...)
    |-- Defer onDone callback via DelayedAction (avoid recursion)

Extract/Transit (Fika):
  CustomExfilService
    |-- FikaBridge.VoteForExfil(target, action) -> fires event to PTT-Fika
    |-- PTT-Fika handles voting, then calls FikaBridge.TransitTo(target)
    |-- FikaBridge.IsTransitDisabled() / CancelVoteForExfil() also delegated
```

### Raid End

```
LocalRaidEndedPatch.Prefix
  |-- CurrentExfilTargetService.ConsumeExitName() -> custom exit name
  |-- If non-null: results.exitName = customExitName
  |-- Plugin.RaidEnded()
        |-- CurrentLocationDataService.Reset()
        |-- ExfiltrationPointAwakePatch.ClearTrackedExfils()
```

## Integration

### Internal (within PTT-Plugin)
- `Plugin.cs` owns the lifecycle. All services are invoked from Plugin's static methods.
- Patches call back into `Plugin.RaidStarted()` / `Plugin.GameStarted()` / `Plugin.RaidEnded()`.
- `CurrentLocationDataService` is referenced by `ExfiltrationPointAwakePatch`, `InitAllExfiltrationPointsPatch`, `ExfilPrompt`, `ExfilTooltip`.
- `ExfilPromptService` (in Services) creates `ExfilPrompt` instances (in UI).
- `CustomExfilService` (Services) uses `FikaBridge` (Services), `CurrentExfilTargetService` (Services), `Helpers.Transit`, and `Helpers.DelayedAction`.

### External (other modules in the repo)
- **PTT-Packets** (`PTT-Packets/PTTPackets.csproj`): Referenced as a ProjectReference. Contains packet DTOs used by both the client plugin and the Fika module.
- **PTT-Fika** (`PTT-Fika/` directory, separate assembly): A satellite assembly loaded at runtime via `Assembly.Load("PTT-Fika")`. It subscribes to `FikaBridge` events to add Fika co-op multiplayer support (voting, host/client roles, transit sync). The bridge pattern means PTT-Plugin compiles without Fika dependency.

### External (runtime dependencies)
- **BepInEx 5**: Plugin host. Entry point via `[BepInPlugin]` attribute.
- **SPT.SptReflection**: Provides `ModulePatch` base class and reflection utilities.
- **SPT.SptCommon**: Provides `RequestHandler` for HTTP calls to the server mod.
- **InteractableExfilsAPI** (Jehree.InteractableExfilsAPI >= 2.0.0): Provides `InteractableExfilsService`, `CustomExfilTrigger`, `CustomExfilAction`, `OnActionsAppliedResult`. Used for rendering custom exfil interaction prompts.
- **Fika.Core** (optional, >= 1.1.5): Co-op multiplayer mod. Detected via `Chainloader.PluginInfos`.
- **EFT game assemblies**: `Assembly-CSharp`, `Comfort`, `UnityEngine.*` -- patched at runtime.
- **PTT Server mod**: HTTP endpoints:
  - `POST /PathToTarkov/Version` -> `{ uninstalled, fullVersion }`
  - `POST /PathToTarkov/CurrentLocationData` -> `{ exfilsTargets: { [exitName]: ExfilTarget[] } }`
