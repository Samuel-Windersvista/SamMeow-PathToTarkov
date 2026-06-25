# src/routes/

## Responsibility

This directory implements the **HTTP API layer** of the PathToTarkov server-side SPT mod. It registers custom static routes into the SPT `StaticRouterModService` so that the client-side BepInEx plugin (PTT-Plugin) can query the server for dynamic raid data. The routes serve as the communication bridge between the in-game Unity client and the SPT mod's backend logic.

There are exactly two endpoints, both registered as static intercepting routes:

| Route | Purpose | Called When |
|---|---|---|
| `/PathToTarkov/Version` | Reports mod version and active/uninstalled state | Plugin `Awake()` -- first thing on game launch |
| `/PathToTarkov/CurrentLocationData` | Returns all configured exfils and transits for the player's current map | Plugin `RaidStarted()` -- every time a raid begins |

---

## Design

### Registration Pattern

Each route file exports a `register*Route` function that accepts `StaticRouterModService` plus any dependencies it needs. The barrel file `index.ts` aggregates them:

```ts
// index.ts
export const registerCustomRoutes = (
  staticRouter: StaticRouterModService,
  pttController: PathToTarkovController,
): void => {
  registerCurrentLocationDataRoute(staticRouter, pttController);
  registerVersionRoute(staticRouter, {
    uninstalled: false,
    fullVersion: pttController.getFullVersion(),
  });
};
```

The caller (`mod.ts::preSptLoad`) wires everything together:

```ts
registerCustomRoutes(staticRouter, this.pathToTarkovController);
```

### Route Mechanics

Both routes use `staticRouter.registerStaticRouter()` with the SPT static router pattern:

1. **Router name** -- `Trap-PathToTarkov-{ROUTE_NAME}` (e.g. `Trap-PathToTarkov-Version`). This name must be unique across all SPT mods.

2. **Route config** -- An array of `{ url, action }` objects. The `url` is the full path (e.g. `/PathToTarkov/Version`). The `action` is an async callback `(url, info, sessionId) => Promise<string>` that must return a JSON string.

3. **Top-level route key** -- The third argument is the "top-level route" (string). Both routes pass `''` (empty string), meaning they intercept at the root level.

### `/PathToTarkov/Version` (version.ts)

- **Request body**: unused (accepts any JSON, typically `{}`).
- **Response shape** (`VersionResponse`):
  ```ts
  type VersionResponse = {
    readonly fullVersion: string;  // e.g. "6.1.0"
    readonly uninstalled: boolean; // true when mod is present but uninstalled
  };
  ```
- **Behaviour**: Stateless -- returns the version info baked into the closure at registration time.
- **Special usage**: During the uninstall procedure (`mod.ts` line 151-156), this route is registered with `uninstalled: true` *before* `registerCustomRoutes` is called, so the client can detect the uninstalled state even when the rest of the mod logic is skipped.

### `/PathToTarkov/CurrentLocationData` (current-location-data.ts)

- **Request shape** (`CurrentLocationDataRequest`):
  ```ts
  type CurrentLocationDataRequest = {
    readonly locationId: string;  // e.g. "BigMap", "factory4_day", "Sandbox"
  };
  ```
- **Response shape** (`CurrentLocationDataResponse`):
  ```ts
  type CurrentLocationDataResponse = {
    readonly exfilsTargets: ExfilsTargets;  // Record<string, ExfilTarget[]>
  };
  ```
- **ExfilTarget shape**:
  ```ts
  type ExfilTarget = {
    exitName: string;
    isTransit: boolean;
    transitMapId: string;        // transit only
    transitSpawnPointId: string; // transit only
    offraidPosition: string;     // empty on transit
    nextMaps: string[];
    nextTraders: string[];
  };
  ```
- **Behaviour**: On each call it:
  1. Reads the player's per-session config via `pttController.getConfig(sessionId)`.
  2. Resolves the `locationId` to a canonical `MapName` via `resolveMapNameFromLocation()`.
  3. Looks up the location's base data from the SPT database (`db.getTables().locations`).
  4. Computes exfils/transits via `getExfilsTargets(pttController, config, mapName, locationBase)` from `../exfils-targets.ts`.
  5. Returns the result as JSON.
- **Error handling**: Throws `Error` if `locationId` is unknown, the locations table is missing, or the location has no base data. These propagate as 500 responses to the client.

### Design Principles

- **Type alignment**: TypeScript types in the route files and C# data classes in the client plugin must be kept in sync manually. Source comments in both codebases explicitly warn about this (`// Warning: This type should be the same than the corresponding client type`).
- **No auth**: SPT static routes implicitly authenticate via `sessionId` (extracted from the request cookies/headers by SPT's infrastructure).
- **JSON transport**: All communication is JSON over HTTP POST. Responses are explicitly serialized with `JSON.stringify()`.
- **Stateless per-call**: Both endpoints recompute their response on every invocation rather than caching.

---

## Flow

### Startup: Version Check

```
[Client Plugin Awake()]
       |
       v
HttpRequest.FetchVersionData()
  POST /PathToTarkov/Version  body: {}
       |
       v
[SPT StaticRouter] matches "/PathToTarkov/Version"
       |
       v
registerVersionRoute action handler
  returns JSON { fullVersion, uninstalled }
       |
       v
[Client Plugin]
  - if null response:   mod is absent    -> sets PathToTarkovIsDisabled = true
  - if uninstalled=true: mod is inactive -> sets PathToTarkovIsDisabled = true
  - otherwise:           mod is active   -> stores fullVersion for mismatch check
```

### Raid Start: Location Data Fetch

```
[Client Plugin RaidStarted()]
       |
       v
CurrentLocationDataService.Init()
  GET locationId from LocalRaidSettingsRetriever.RaidSettings.location
       |
       v
HttpRequest.FetchCurrentLocationData(locationId)
  POST /PathToTarkov/CurrentLocationData  body: { locationId }
       |
       v
[SPT StaticRouter] matches "/PathToTarkov/CurrentLocationData"
       |
       v
registerCurrentLocationDataRoute action handler
  1. pttController.getConfig(sessionId)     -- get per-session PTT config
  2. resolveMapNameFromLocation(locationId) -- "BigMap" -> "bigmap", "factory4_day" -> "factory4_day", etc.
  3. location = db.locations[locationKey]   -- lookup location base data
  4. getExfilsTargets(controller, config, mapName, locationBase)
     a. Read exfiltrations from config by mapName
     b. Parse each exfil target (extract -> offraidPosition, transit -> map + spawn point)
     c. Compute nextMaps and nextTraders for tooltip display
     d. Optionally include Scav-only extracts from external-resources/maps/*_allExtracts.json
  5. return JSON { exfilsTargets }
       |
       v
[Client Plugin]
  CurrentLocationDataService stores response
  ExfiltrationPointAwakePatch.DisableInvalidExfils() -- hides exfils not in the response
  InitAllExfiltrationPointsPatch.ApplyExfilFiltering()
  ExfilPromptService uses ExfilTarget data to render tooltip prompts
```

### Raid End: Cleanup

```
[Client Plugin RaidEnded()]
       |
       v
CurrentLocationDataService.Reset()  -- clears cached response for next raid
ExfiltrationPointAwakePatch.ClearTrackedExfils()
```

---

## Integration

### Upstream: Called by `mod.ts`

The routes directory is consumed by the single mod entry point:

| File | What it does |
|---|---|
| `src/mod.ts` (line 164) | Calls `registerCustomRoutes(staticRouter, controller)` during `preSptLoad()` |
| `src/mod.ts` (lines 151-156) | Independently registers the Version route early when `runUninstallProcedure` is true |

The `StaticRouterModService` is resolved from the SPT dependency injection container (`container.resolve<StaticRouterModService>('StaticRouterModService')`).

### Downstream: Controller and Services

The `CurrentLocationData` route depends on several modules:

```
routes/current-location-data.ts
  |-- path-to-tarkov-controller.ts     -- config getter, debug logger, database access
  |-- exfils-targets.ts                -- getExfilsTargets(): builds ExfilsTargets from config
  |       |-- config.ts                -- Config types, MapName, exfiltrations config shape
  |       |-- map-name-resolver.ts     -- resolveMapNameFromLocation(), resolveLocationIdFromMapName()
  |       |-- helpers.ts               -- checkAccessVia(), isWildcardAccessVia()
  |       |-- path-to-tarkov-controller.ts  -- getConfig(), getUserConfig(), tradersController
  |       |-- traders-controller.ts    -- isTraderInstalled()
  |       |-- _generated/all-vanilla-exfils.ts -- fallback list of all vanilla extract names
  |       +-- external-resources/maps/ -- optional per-map JSON files listing all extracts (including Scav)
  |-- map-name-resolver.ts             -- location<->map name translation
```

### Client: Consumed by PTT-Plugin (BepInEx C#)

The client-side data contracts that mirror the server types:

| Server (TypeScript) | Client (C#) | Path |
|---|---|---|
| `CurrentLocationDataRequest` | `CurrentLocationDataRequest` | `PTT-Plugin/Data/CurrentLocationData.cs` |
| `CurrentLocationDataResponse` | `CurrentLocationDataResponse` | `PTT-Plugin/Data/CurrentLocationData.cs` |
| `ExfilTarget` | `ExfilTarget` | `PTT-Plugin/Data/ExfilTarget.cs` |
| `VersionResponse` | `VersionDataResponse` | `PTT-Plugin/Data/VersionData.cs` |

The client HTTP calls originate in:

| Client file | Method | Route |
|---|---|---|
| `PTT-Plugin/Helpers/HttpRequest.cs` | `FetchCurrentLocationData(locationId)` | `POST /PathToTarkov/CurrentLocationData` |
| `PTT-Plugin/Helpers/HttpRequest.cs` | `FetchVersionData()` | `POST /PathToTarkov/Version` |

The service layer that consumes the route responses:

| Client file | Role |
|---|---|
| `PTT-Plugin/Services/CurrentLocationDataService.cs` | Calls `FetchCurrentLocationData`, caches the response; exposes `IsExfiltrationPointEnabled()` and `GetExfilTargets()` for UI patches |
| `PTT-Plugin/Plugin.cs` | Orchestrates startup (`FetchVersionData` in `Awake()`, `CurrentLocationDataService.Init()` in `RaidStarted()`) |
