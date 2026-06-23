# PTT-Plugin/Data/

## Responsibility

This folder defines the client-side Data Transfer Objects (DTOs) used by the PathToTarkov plugin to communicate with the SPT server via HTTP. Every class here is a plain data holder -- no behavior except formatting/display logic on `ExfilTarget`. The DTOs serve two distinct purposes:

| DTO | Endpoint | Purpose |
|-----|----------|---------|
| `CurrentLocationDataRequest` / `CurrentLocationDataResponse` | `POST /PathToTarkov/CurrentLocationData` | Fetch exfil targets for the current raid location |
| `VersionDataResponse` | `POST /PathToTarkov/Version` | Check server presence and version compatibility |

A closely-related type, `RawExfilTarget`, lives in the **PTT-Packets** project (not this folder) and serves the multiplayer wire format -- it is documented here for cross-reference.

---

## Design

### CurrentLocationDataRequest / CurrentLocationDataResponse

Two classes co-located in a single file (`CurrentLocationData.cs`).

- **Request**: Single-field DTO (`string locationId`) -- serialized to JSON and POSTed to the server.
- **Response**: Carries a `Dictionary<string, List<ExfilTarget>>` keyed by **exit name**. This design allows one HTTP call to return all exfils for the current map in a flat lookup structure. The dictionary is initialized empty by default (avoiding null checks in consumers).

### `ExfilTarget`

A rich DTO -- mostly fields, but also carries three display and filtering methods. The class header warns "The fields here are shared with the server," meaning the server also serializes/deserializes the same field set under the same JSON contract.

```
Fields:
  exitName            (string)   -- name of the exfiltration point
  isTransit           (bool)     -- true = map-to-map transit, false = off-raid extract
  transitMapId        (string)   -- target map ID (only meaningful when isTransit)
  transitSpawnPointId (string)   -- spawn point on target map (only for transit)
  offraidPosition     (string)   -- position name for off-raid extraction (empty for transit)
  nextMaps            (string[]) -- map names for tooltip rendering
  nextTraders         (string[]) -- trader names for tooltip rendering

Methods:
  GetCustomActionName(bool isDisabled) -> string
   - Builds a localized UI label for the exfil action button.
   - If isTransit: formats via "PTT_TRANSITS_PROMPT_TEMPLATE" using transitMapId.
   - Otherwise: formats via "PTT_EXTRACTS_PROMPT_TEMPLATE" using offraidPosition.
   - Falls back to raw offraidPosition string if localization key cannot be resolved.
   - Debug mode appends "*" suffix for sandbox_high transit.

  GetCustomExitName() -> string
   - Produces a composite key: "exitName.transitMapId.transitSpawnPointId" (transit)
     or "exitName.offraidPosition" (extract).
   - Used to identify which exfil action was chosen, stored/consumed across raid boundary.

  IsAvailable() -> bool
   - Level-gated filtering for sandbox maps:
     * Players >= 20 cannot use "sandbox" (low-level) transit.
     * Players < 20 cannot use "sandbox_high" (high-level) transit.
   - Returns true when transitMapId is null (non-transit exfils are always available).
```

### `VersionDataResponse`

Minimal version-check DTO:

```
Fields:
  uninstalled    (bool)   -- if true, the PTT server mod is absent or removed
  fullVersion    (string) -- semantic version string, e.g. "1.2.3"
```

When `uninstalled` is true or the response is null, the plugin disables itself entirely.

### `RawExfilTarget` (cross-reference)

Defined in `PTT-Packets/Packets/RawExfilTarget.cs` (not `PTT-Plugin/Data/`). A network-optimized `struct` implementing `INetSerializable` that mirrors the field set of `ExfilTarget` (minus `nextMaps`/`nextTraders`). Used inside `PlayerVotedForExfilTargetPacket` for Fika multiplayer voting.

```
Fields (public):
  ExitName            (string)   -- empty string = player leaving a zone
  IsTransit           (bool)
  TransitMapId        (string)   -- transit only
  TransitSpawnPointId (string)   -- transit only
  OffraidPosition     (string)   -- empty for transit

Serialization quirk:
  null strings are written as "" on the wire, and read back as null via EnsureNull().
```

---

## Flow

```
Plugin startup (Awake):
  FetchVersionData()  -- POST /PathToTarkov/Version
       |
       v
  VersionDataResponse
     - uninstalled=false & fullVersion != null => plugin proceeds
     - uninstalled=true or null response       => plugin disables

Raid started:
  CurrentLocationDataService.Init()
       |
       v
  FetchCurrentLocationData(locationId)  -- POST /PathToTarkov/CurrentLocationData
       |                                   Body: {"locationId": "factory4_day"}
       v
  CurrentLocationDataResponse
     exfilsTargets: {
       "factory_exit": [ { exitName, isTransit, transitMapId, ... } ],
       "gate_0":       [ { exitName, isTransit, offraidPosition, ... } ],
       ...
     }
       |
       v
  ExfiltrationPointAwakePatch.DisableInvalidExfils()
     - checks each ExfiltrationPoint against exfilsTargets keys
     - points NOT in the dictionary are disabled

  InitAllExfiltrationPointsPatch.ApplyExfilFiltering()
     - applies per-exfil target filtering (IsAvailable)

During raid (player interacts with exfil):
  UI components (ExfilPrompt, ExfilTooltip):
     - GetExfilTargets(ExfiltrationPoint) returns List<ExfilTarget>
     - Each ExfilTarget's GetCustomActionName() provides the button label
     - On selection, ExfilTarget is serialized and passed through
       FikaBridge / CustomExfilService to execute the transit/extract

Raid end:
  CurrentLocationDataService.Reset()  -- clears cached data for next raid
```

---

## Integration

| Consumer | What it uses | How |
|----------|-------------|-----|
| `Helpers.HttpRequest` | `CurrentLocationDataRequest`, `CurrentLocationDataResponse`, `VersionDataResponse` | Serializes request/response to/from JSON via Newtonsoft.Json over SPT's `RequestHandler.PostJson()` |
| `Services.CurrentLocationDataService` | `CurrentLocationDataResponse`, `ExfilTarget` | Caches the response; exposes `IsExfiltrationPointEnabled()` and `GetExfilTargets()` |
| `Services.CustomExfilService` | `ExfilTarget` | Reads fields to execute transit vs. extract; uses `GetCustomExitName()` to persist the choice |
| `Services.CurrentExfilTargetService` | `ExfilTarget` | Stores/consumes the single selected exfil target across raid boundary |
| `Services.FikaBridge` | `ExfilTarget` | Delegates voting/transit events; the multiplayer counterpart converts `ExfilTarget` <-> `RawExfilTarget` for wire transmission |
| `UI.ExfilPrompt` | `ExfilTarget` | Builds UI action buttons via `CreateCustomExfilAction()`; uses `IsAvailable()` for filtering |
| `UI.ExfilTooltip` | `ExfilTarget` | Renders tooltip with `nextMaps` and `nextTraders` |
| `Helpers.Transit` | `ExfilTarget` | Creates a `TransitPoint` from an `ExfilTarget` when executing a map transit |
| `Patches.LocalRaidEndedPatch` | `ExfilTarget` (via `CurrentExfilTargetService`) | Reads the custom exit name string at raid end to report which exfil was used |
| `Plugin.cs` | `VersionDataResponse` | Checks `uninstalled` flag on startup; displays version mismatch warning on mismatch |
| `PTT-Packets/Packets/PlayerVotedForExfilTargetPacket` | `RawExfilTarget` (struct mirror) | Embeds a network-friendly copy of `ExfilTarget` fields in Fika vote packets |

### Key Integration Notes

- **No server-side project** exists locally. The server is a TypeScript SPT mod that defines matching DTOs and routes under `/PathToTarkov/`.
- **VersionDataResponse** is the first call the plugin makes -- it gates the entire plugin activation.
- **ExfilTarget** is the central data type: it crosses the HTTP boundary (from server), the service layer, the UI layer, and (via `RawExfilTarget`) the multiplayer network boundary.
- **RawExfilTarget** deliberately omits `nextMaps`/`nextTraders` because those are UI-only fields not needed in voting logic over the wire.
