# PTT-Plugin/Services/ -- Architectural Codemap

## Responsibility

The `Services` folder contains all runtime service classes that orchestrate the core gameplay loop of PathToTarkov: determining which exfiltration points are available on the current map, rendering the custom UI prompt for those points, executing extracts or transits, and bridging communication with the optional Fika multiplayer module. These services sit between the BepInEx plugin entry point (`Plugin.cs`) and the lower-level helpers (HTTP, patches, data models).

There are seven services, each with a distinct responsibility:

| Service | Kind | Role |
|---|---|---|
| `LocalRaidSettingsRetriever` | static data holder | Holds the current raid's settings (location, time, etc.) |
| `CurrentLocationDataService` | instance data service | Fetches and caches exfil target data from the PTT server for the current location |
| `CurrentExfilTargetService` | static state holder | Tracks the exfil target chosen during a raid for exit-name override |
| `ExfilPromptService` | instance UI service | Manages IE API event hooks and renders the prompt UI for each exfil point |
| `IEApiWrapper` | static bootstrap | Resolves the `InteractableExfilsService` singleton and wires up `ExfilPromptService` |
| `CustomExfilService` | static action dispatcher | Executes extract or transit operations, delegating to Fika when installed |
| `FikaBridge` | static event bridge | Provides event-based communication with the optional `PTT-Fika` assembly |

---

## Design

### 1. LocalRaidSettingsRetriever

```csharp
public static class LocalRaidSettingsRetriever
{
    static public LocalRaidSettings RaidSettings { get; set; }
    static public LocalSettings LocalSettings { get; set; }
}
```

**Pattern:** Static property bag. Populated externally (by patches in `PTT.Patches` observing raid start) before services are initialized. Used by `CurrentLocationDataService` to obtain the location ID.

**Why static:** No behavior, just a single source of truth for raid context set once per raid lifecycle.

---

### 2. CurrentLocationDataService

```csharp
public class CurrentLocationDataService
```

**Pattern:** Instance service owned by `Plugin`. Created in `Plugin.Awake()`, initialized at `Plugin.RaidStarted()`.

- **Init()** (idempotent via `_isInitialized` flag):
  1. Reads `LocalRaidSettingsRetriever.RaidSettings.location` for the location ID.
  2. Calls `HttpRequest.FetchCurrentLocationData(locationId)` to fetch `CurrentLocationDataResponse` from the server (HTTP GET to PTT server endpoint).
  3. Stores a dictionary: `Dictionary<string, List<ExfilTarget>>` mapping exfil point names to their possible targets.
  4. Triggers `InitAllExfiltrationPointsPatch.TryApplyExfilFiltering()` to immediately filter exfil points based on server data.
- **IsExfiltrationPointEnabled(ExfiltrationPoint):** Checks if the exfil point name exists as a key in `exfilsTargets`. If absent, the exfil is disabled.
- **GetExfilTargets(ExfiltrationPoint):** Returns the `List<ExfilTarget>` for a given exfil point, or null.
- **Reset():** Called at raid end (`Plugin.RaidEnded()`) to clear state for the next raid.

**Design decision:** The service caches server data per raid. This means the server is queried once at raid start. Disabled exfils are simply absent from the dictionary -- no separate disabled list is needed.

---

### 3. CurrentExfilTargetService

```csharp
public static class CurrentExfilTargetService
```

**Pattern:** Static singleton state holder.

- **SaveExfil(ExfilTarget):** Stores the exfil target chosen by the player.
- **ConsumeExitName():** Returns the custom exit name (constructed by `ExfilTarget.GetCustomExitName()`) then clears the stored target. This is a "consume once" pattern -- the exit name is read exactly once by `LocalRaidEndedPatch` to override the exit name in the raid end payload, enabling quest validation for custom exfils (e.g. "Burning Rubber" quest).

**Why consume-once:** The custom exit name is needed only at the exact moment the raid ends to stamp the correct exit identifier into `ExitStatus.Survived`. After consumption, the state resets automatically.

---

### 4. ExfilPromptService

```csharp
internal class ExfilPromptService(InteractableExfilsService ieService)
```

**Pattern:** Instance service wrapping the `InteractableExfilsService` singleton from the external `Jehree.InteractableExfilsAPI` (IE API). Constructor-injected via `IEApiWrapper`.

**Key design decisions:**

- **`DisableVanillaActions = true`** -- PTT takes full control of exfil UI. The vanilla SPT extract prompt is completely suppressed.
- **Event unhook of `ieService.ApplyExtractToggleAction`** -- The IE API's default behavior (which would add toggle/extract actions) is removed. PTT substitutes its own handler.
- **`RequiresManualActivation`** -- Forces every exfil trigger to require manual user activation. No auto-extract, even if the player enabled that option in IE API's BepInEx config.
- **Exfil filtering check** -- Both `RequiresManualActivation` and `ExfilPromptHandler` check `CurrentLocationDataService.IsExfiltrationPointEnabled()`. Disabled exfils return an empty `OnActionsAppliedResult` (no actions = no interaction possible).
- **Prompt caching** -- `IndexedExfilPrompts` dictionary caches `ExfilPrompt` instances by exfil name. Cache is cleared via `ClearExfilPromptsCache()` at raid start.

**Prompt rendering flow** (delegated to `PTT.UI.ExfilPrompt`):
1. If first render in this interaction: init prompt state.
2. If already exfiltrated: return null (no further actions).
3. Fetch `List<ExfilTarget>` from `CurrentLocationDataService`.
4. Filter targets by `IsAvailable()` (player level vs. sandbox map restrictions).
5. For each available target, create a `CustomExfilAction` (transit or extract).
6. On action select: present confirm/cancel sub-menu via a second render pass.
7. On confirm: delegate to `CustomExfilService.ExtractTo()` or `CustomExfilService.TransitTo()`.
8. On exit zone: cancel any pending transit vote.

---

### 5. IEApiWrapper

```csharp
static internal class IEApiWrapper
```

**Pattern:** Static initialization gateway. Called from `Plugin.Start()` when IE API >= 2.0.0 is detected.

- Resolves `Singleton<InteractableExfilsService>.Instance` from the IE API.
- Constructs `ExfilPromptService(interactableExfilsService)` and calls `Init()`.
- Exposes `ExfilPromptService` as a public static field for other code (e.g., `Plugin.RaidStarted()` clears its cache).

**Why a separate wrapper:** Keeps the IE API dependency isolated. If the IE API is not installed or outdated, only this wrapper fails gracefully; the rest of PTT continues (though exfil prompts will not render).

---

### 6. CustomExfilService

```csharp
public static class CustomExfilService
```

**Pattern:** Static action dispatcher with Fika-awareness branching.

**ExtractTo(ExfiltrationPoint, ExfilTarget):**
- **Fika path:** Calls `FikaBridge.TransitTo(exfilTarget)`. In Fika, extraction is a transit-like operation handled by the Fika module for synchronization.
- **Local path:**
  1. Saves exfil target to `CurrentExfilTargetService.SaveExfil()`.
  2. Calls `localGame.Stop(player.ProfileId, ExitStatus.Survived, exitName, delay)`.
  3. The `exitName` argument is the PTT custom exit name (from `ExfilTarget.GetCustomExitName()`) -- this drives `LocalRaidEndedPatch` to override the exit name for quest validation.

**TransitTo(ExfilTarget, Action):**
- **Fika path:** Initiates a voting flow via `FikaBridge.VoteForExfil()`. After the vote resolves, calls `FikaBridge.TransitTo()`.
- **Local path:**
  1. Creates a `TransitPoint` via `Transit.Create(exfilTarget)` -- a minimal `TransitPoint` with the custom transit name, location ID, and activated flag.
  2. Saves exfil target to `CurrentExfilTargetService.SaveExfil()`.
  3. Calls `TransitControllerAbstractClass.Transit()` with player profile data.
  4. Defers the `onTransitDone` callback via a `DelayedAction` MonoBehaviour to avoid Unity's "ManualUpdate from inside ManualUpdate" error.

**IsTransitDisabled(ExfilTarget):** Proxies to `FikaBridge.IsTransitDisabled()` when Fika is installed and the target is a transit. Returns false for local games (no voting needed).

**CancelTransitVote(string):** Proxies to `FikaBridge.CancelVoteForExfil()` when Fika is installed.

---

### 7. FikaBridge

```csharp
public static class FikaBridge
{
    // Event declarations only -- no Fika assembly reference
    public static event SimpleBoolReturnEvent IsHostEmitted;
    public static event VoteForExfilEvent VoteForExfilEmitted;
    // ...
}
```

**Pattern:** Event-based bridge pattern. The bridge declares C# events for every interaction point. The `PTT-Fika` assembly (loaded via reflection in `Plugin.TryInitFikaModule()`) subscribes handlers to these events. The core `PTT` assembly has zero compile-time dependency on Fika.

**Event categories:**

| Category | Events |
|---|---|
| Lifecycle | `PluginAwakeEmitted`, `PluginStartEmitted`, `RaidStartedEmitted`, `GameStartedEmitted` |
| Role queries | `IsHostEmitted`, `IsClientEmitted`, `IsDedicatedEmitted`, `IsHostPlayerEmitted` |
| Player info | `GetMyPlayerNetIdEmitted`, `GetHumanPlayersEmitted` |
| Transit voting | `VoteForExfilEmitted`, `CancelVoteForExfilEmitted`, `IsTransitDisabledEmitted`, `SendDisableTransitVotePacketEmitted` |
| Exfil action | `TransitToEmitted` |

**Null safety:** Every invocation uses the `?.Invoke()` pattern with a default fallback (false, 0, or empty list) so the bridge works gracefully without the Fika module.

---

## Flow

### Raid Start Sequence

```
Plugin.RaidStarted()
  ├── FikaBridge.RaidStarted()  ──► PTT-Fika module handles raid start
  ├── CurrentLocationDataService.Init()
  │     ├── Reads LocalRaidSettingsRetriever.RaidSettings.location
  │     ├── HttpRequest.FetchCurrentLocationData(locationId)  ──► PTT Server
  │     └── InitAllExfiltrationPointsPatch.TryApplyExfilFiltering()
  ├── IEApiWrapper.ExfilPromptService.ClearExfilPromptsCache()
  ├── ExfiltrationPointAwakePatch.DisableInvalidExfils()
  ├── InitAllExfiltrationPointsPatch.ApplyExfilFiltering()
  └── CurrentExfilTargetService.Init()
```

### Player Interacts with Exfil Point

```
Player activates exfil trigger
  └── IE API fires OnActionsAppliedEvent
        └── ExfilPromptService.RequiresManualActivation()
              └── checks CurrentLocationDataService.IsExfiltrationPointEnabled()
              └── sets customExfilTrigger.RequiresManualActivation = true
        └── ExfilPromptService.ExfilPromptHandler()
              └── checks IsExfiltrationPointEnabled()
              └── ExfilPrompt(exfil).Render()
                    ├── GetExfilTargets() from CurrentLocationDataService
                    ├── Filter by IsAvailable() (level-based sandbox restrictions)
                    ├── Create CustomExfilAction per target
                    └── Return OnActionsAppliedResult to IE API
```

### Player Confirms Extract

```
ExfilPrompt: onConfirm
  └── CustomExfilService.ExtractTo(exfil, exfilTarget)
        ├── [Fika] FikaBridge.TransitTo(exfilTarget)
        └── [Local] CurrentExfilTargetService.SaveExfil(exfilTarget)
              └── localGame.Stop(profileId, Survived, customExitName, 0)
                    └── LocalRaidEndedPatch consumes exitName via CurrentExfilTargetService.ConsumeExitName()
```

### Player Confirms Transit

```
ExfilPrompt: onConfirm
  └── CustomExfilService.TransitTo(exfilTarget, onTransitDone)
        ├── [Fika] FikaBridge.VoteForExfil(exfilTarget, () => FikaBridge.TransitTo(exfilTarget))
        └── [Local] CurrentExfilTargetService.SaveExfil(exfilTarget)
              └── Transit.Create(exfilTarget) → TransitPoint
              └── TransitControllerAbstractClass.Transit(transit, ...)
              └── DelayedAction defers callback to next frame
```

### Raid End Sequence

```
Plugin.RaidEnded()
  ├── CurrentLocationDataService.Reset()
  └── ExfiltrationPointAwakePatch.ClearTrackedExfils()
```

---

## Integration

### With InteractableExfilsAPI (Jehree.InteractableExfilsAPI)

PTT consumes IE API as a soft dependency (v2.0.0+ required). Integration happens entirely through `IEApiWrapper` + `ExfilPromptService`:

- **Resolution:** `Singleton<InteractableExfilsService>.Instance` is resolved at `Plugin.Start()`.
- **Event hooks:** `ExfilPromptService` subscribes to `OnActionsAppliedEvent` and replaces IE API's default `ApplyExtractToggleAction` handler.
- **Data contract:** Uses `CustomExfilAction`, `CustomExfilTrigger`, and `OnActionsAppliedResult` from IE API's `InteractableExfilsAPI.Common` namespace.
- **UI rendering:** `ExfilPrompt.Render()` returns `OnActionsAppliedResult` containing the list of `CustomExfilAction` items IE API uses to build the prompt UI.

### With PTT Server (HTTP)

Communication occurs exclusively through `Helpers.HttpRequest`:

- **Version check:** `HttpRequest.FetchVersionData()` -- called in `Plugin.Awake()` to validate client-server compatibility.
- **Location data:** `HttpRequest.FetchCurrentLocationData(locationId)` -- called in `CurrentLocationDataService.FetchExfilsTargetsForCurrentLocation()`.

The response format is `CurrentLocationDataResponse` which maps exfil point names to `List<ExfilTarget>`. Each `ExfilTarget` specifies whether it's an extract or transit, the offraid position (for extracts), the target map and spawn point (for transits), and display metadata (next maps/traders).

### With PTT-Fika (Optional Mod)

Communication uses the event-based `FikaBridge`:

```
PTT (core)                     PTT-Fika (separate assembly)
==========                     ============================
FikaBridge.IsHost()  ──event──► subscribes to IsHostEmitted
                              ◄── returns bool
FikaBridge.VoteForExfil() ──► subscribes to VoteForExfilEmitted
                              ◄── invokes callback
```

The `PTT-Fika` assembly is loaded via reflection in `Plugin.TryInitFikaModule()`:
```csharp
Assembly.Load("PTT-Fika");
typeof(PTT.Fika.Main).GetMethod("Init").Invoke(null, null);
```

This `Init` method subscribes handlers to all `FikaBridge` events. The bridge pattern ensures:
1. No compile-time Fika dependency in the core plugin.
2. Graceful degradation when Fika is absent -- all bridge queries return safe defaults.
3. Clear contract surface -- every interaction point is an explicit event signature.

### With Patches (PTT.Patches)

Services trigger patch behavior for exfil filtering:

| Service | Patch Interaction |
|---|---|
| `CurrentLocationDataService.Init()` | Calls `InitAllExfiltrationPointsPatch.TryApplyExfilFiltering()` |
| `Plugin.RaidStarted()` | Calls `ExfiltrationPointAwakePatch.DisableInvalidExfils()` and `InitAllExfiltrationPointsPatch.ApplyExfilFiltering()` |
| `CurrentExfilTargetService.ConsumeExitName()` | Called by `LocalRaidEndedPatch` to get the custom exit name for quest validation |
| `Plugin.RaidEnded()` | Calls `ExfiltrationPointAwakePatch.ClearTrackedExfils()` |

### With Plugin.cs (Entry Point)

The `Plugin` class orchestrates all services:

```
Plugin.Awake()
  ├── Creates new CurrentLocationDataService()
  ├── Registers all patches
  ├── Initializes PTT-Fika module (if installed)
  └── FikaBridge.PluginAwake()

Plugin.Start()
  ├── Fika version check
  ├── IE API version check
  ├── IEApiWrapper.Init() ──► creates ExfilPromptService
  └── FikaBridge.PluginStart()

Plugin.RaidStarted()
  ├── FikaBridge.RaidStarted()
  ├── CurrentLocationDataService.Init()
  ├── ExfilPromptService.ClearExfilPromptsCache()
  ├── Apply exfil filtering
  ├── CurrentExfilTargetService.Init()
  └── IE API cache clear

Plugin.GameStarted()
  └── FikaBridge.GameStarted()

Plugin.RaidEnded()
  ├── CurrentLocationDataService.Reset()
  └── ExfiltrationPointAwakePatch.ClearTrackedExfils()
```
