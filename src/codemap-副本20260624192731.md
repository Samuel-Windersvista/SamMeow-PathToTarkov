# src/ -- PathToTarkov Server-Side Mod

## Responsibility

This directory implements the **server-side mod** for **Single Player Tarkov (SPT)** that replaces the vanilla map traversal system with a position-based gating mechanism. Players occupy an "offraid position" (a named location outside of raids) that determines:

- Which maps they can infiltrate (and at which spawn points)
- Which extracts lead to which positions
- Whether they have access to their main stash (vs. a secondary stash) and hideout
- Which traders are unlocked
- Whether offraid health/energy/hydration regeneration is enabled
- Whether the flea market is available

The mod is entirely **config-driven**: gameplay behavior is defined by JSON5 config files loaded at startup, not hardcoded.

---

## Design

### Entry Point

`mod.ts` exports a `PathToTarkov` class implementing `IPreSptLoadMod`, `IPostSptLoadMod`, and `IPostSptLoadMod` (the third via `postSptLoad` -- SPT's original `IPostSptLoadMod`). Boot order:

| Phase | Action |
|---|---|
| `preSptLoad` | UserConfig -> Config -> SpawnConfig loading; controller construction; route registration; event watcher setup; static analysis validation |
| `postDBLoad` | Early RagFair config mutation; exfil tooltip debug |
| `postSptLoad` | Legacy PTT API exposure (deprecated); `controller.loaded()` final init |

### Core Classes

| Class | File | Role |
|---|---|---|
| `PathToTarkovController` | `path-to-tarkov-controller.ts` | Central orchestrator. Manages spawn points, exits, transits, stash switching, trader updates, offraid regen, flea market, hideout visibility, and locale injection. Maintains a per-session `configCache`. |
| `EventWatcher` | `event-watcher.ts` | Intercepts SPT callbacks to track raid lifecycle via a per-session `RaidCache`. Hooks: `/client/game/start`, `/client/game/profile/create`, `MatchController.startLocalRaid`, `MatchCallbacks.endLocalRaid`. |
| `EndOfRaidController` | `end-of-raid-controller.ts` | Processes the end-of-raid payload: player death (reset position), extract (update position + FIR tweak), or transit (position unchanged). |
| `StashController` | `stash-controller.ts` | Creates stash item templates in the DB, manages switching between main stash and position-dependent secondary stashes. |
| `TradersController` | `traders-controller.ts` | Manages trader unlock/lock per offraid position, insurance/repair/heal config, description locale injection. |
| `TradersAvailabilityService` | `services/TradersAvailabilityService.ts` | Built from quest rewards -- maps each trader to the quest ID(s) that unlock it. Used to fall back to quest-based unlock when location access is granted. |
| `ExfilsTooltipsTemplater` | `services/ExfilsTooltipsTemplater.ts` | Generates localized exfil tooltip strings using `$exfilDisplayName` and `$offraidPositionDisplayName` variable substitution. |
| `KeepFoundInRaidTweak` | `keep-fir-tweak.ts` | After successful extract, sets `SpawnedInSession` on all equipped items to preserve FIR status. |
| `ExfilsTargetsBuilder` (in `exfils-targets.ts`) | `exfils-targets.ts` | Builds the `ExfilsTargets` response consumed by the client plugin, resolving next maps and next traders per extract. |

### Static Utilities

| File | Contents |
|---|---|
| `helpers.ts` | Spawn point / exit point creation factories, `checkAccessVia` (wildcard-aware access check), `mutateLocales` (bulk DB locale mutation), `disableRunThrough`, `changeRestrictionsInRaid`, `PTT_INFILTRATION` constant. |
| `config.ts` | All TypeScript types (`Config`, `UserConfig`, `SpawnConfig`, `StashConfig`, `TradersConfig`, etc.), config processing (`processConfig`, `processSpawnConfig`, `mergeAdditionalSpawnpoints`), path constants, `getUserConfig` with auto-migration. |
| `config-analysis.ts` | Static validation: checks offraid position references, exfil map/extract validity against vanilla data, spawn point existence, locale validity, unsupported property migration warnings. |
| `utils.ts` | JSON5 file I/O wrapped around `JsonUtil`, deep clone, shuffle, `getPTTMongoId` (predictable `deadbeef`-prefixed SHA1 mongo IDs), type guards. |
| `map-name-resolver.ts` | Bi-directional mapping between SPT location IDs (`factory`, `customs`, `reservebase`) and PTT map names (`factory4_day`, `bigmap`, `rezervbase`). Handles `isSameMap` for paired variants (day/night, sandbox/sandbox_high). |
| `modLoader.ts` | Utility to read the mod loader's `imported` record for inter-mod detection. |
| `fix-repeatable-quests.ts` | Patches `RepeatableQuestGenerator` to pass `unlocked: true` for all traders (preventing crashes from locked traders); also cleans broken repeatable quests from profiles. |
| `installation-analysis.ts` | Guards against misinstallation (detects forbidden file in `configs/`). |
| `uninstall.ts` | Full uninstall procedure: restores main stashes and trader unlock states for all profiles. |
| `all-exfils.ts` | Vanilla extract name validation (slug-based aliases to generated data). |

### Routes

Custom static HTTP routes registered via `StaticRouterModService`, consumed by the client-side **PTT-Plugin**:

| Route | Handler | Purpose |
|---|---|---|
| `/PathToTarkow/Version` | `routes/version.ts` | Returns `{ fullVersion, uninstalled }` for plugin compatibility check |
| `/PathToTarkov/CurrentLocationData` | `routes/current-location-data.ts` | Returns `ExfilsTargets` for the player's current map, including next maps and accessible traders |

### Generated Data

| File | Description |
|---|---|
| `_generated/all-vanilla-exfils.ts` | Auto-generated (via `generate-all-exfils.js` script) exhaustive list of vanilla extract names per map. Used by `all-exfils.ts` and `exfils-targets.ts`. |

### Key Abstractions

**Access Control via `access_via`**: A string or string[] property on stashes, traders, and regen configs. Supports wildcard (`"*"`) to mean "always accessible." The function `checkAccessVia(access_via, offraidPosition)` determines if a given offraid position grants access.

**Exfil Target Notation**: A dot-separated encoding used in config and in the raid exit name:
- `"Gate 3.MY_OFFRAID"` -- extract named "Gate 3" routes to offraid position "MY_OFFRAID"
- `"Gate 3.bigmap.SPAWN_01"` -- extract "Gate 3" transits to map "bigmap" at spawn point "SPAWN_01"
- Parsed by `parseExfilTargetFromExitName` (for raid end) and `parseExilTargetFromPTTConfig` (for config processing).

**DI Override Pattern**: The mod uses `container.afterResolution(<key>, cb, { frequency: 'Always' })` to monkey-patch SPT controllers and callbacks. This is the primary integration mechanism for: `LocationController`, `DataCallbacks`, `MatchController`, `MatchCallbacks`, `RagfairCallbacks`, `RepeatableQuestGenerator`.

---

## Flow

### 1. Mod Loading (`mod.ts:preSptLoad`)

```
readJsonFile(configs/<selectedConfig>/config.json5)
  -> processConfig() -> normalizes infiltrations, exfiltrations, stashes, regen config
readJsonFile(src/do_not_distribute/shared_player_spawnpoints.json5)
  -> processSpawnConfig() -> merges with additional_player_spawnpoints from config
getUserConfig() -> reads/creates UserConfig.json5 with defaults

create PathToTarkovController(config, spawnConfig, userConfig, ...deps)
  -> init()
    -> overrideControllers()  (LocationController.generateAll, DataCallbacks.*)
    -> overrideRagfairRoutes() (RagfairCallbacks.*)

create EventWatcher + EndOfRaidController
EventWatcher.register()
  -> watchOnGameStart (peek /client/game/start)
  -> watchOnProfileCreated (peek /client/game/profile/create)
  -> watchStartOfRaid (override MatchController.startLocalRaid)
  -> watchEndOfRaid (override MatchCallbacks.endLocalRaid)

registerCustomRoutes()
  -> registerCurrentLocationDataRoute()
  -> registerVersionRoute()
```

### 2. Config Validation (`mod.ts:runStaticAnalysis`)

```
analyzeConfig(config, spawnConfig)
  -> checks: infiltrations (maps, spawn points), exfiltrations (maps, extracts against vanilla), 
     offraid position references, stash config, trader config, locale validity, spawn config, 
     unsupported properties
  -> errors thrown as fatal; warnings logged
```

### 3. Post-DB Load (`mod.ts:postDBLoad`)

```
controller.setEarlyRagFairConfig()  -> mutates globals.config.RagFair.minUserLevel
controller.debugExfiltrationsTooltips()  -> optional locale debug output
```

### 4. Post-SPT Load (`mod.ts:postSptLoad`)

```
createPathToTarkovAPI(controller)  -> optionally exposes globalThis.PathToTarkovAPI (legacy)
controller.loaded(config)
  -> TradersAvailabilityService.init(quests)  -> builds trader unlock quest map
  -> injectTooltipsInLocales()  -> generates & applies exfil tooltip locales
  -> injectPromptTemplatesInLocales()  -> transit/extract prompt templates
  -> injectOffraidPositionDisplayNamesInLocales()  -> offraid position display name locales
  -> TradersController.initTraders()  -> configures trader bases, insurance, repair, heal
  -> StashController.initSecondaryStashTemplates()  -> creates custom stash item templates in DB
  -> disableRunThrough()  -> sets survived XP/seconds requirement to 0
```

### 5. Game Start / Profile Create (`EventWatcher`)

```
/client/game/start intercepted:
  -> initRaidCache(sessionId)
  -> controller.initPlayer(sessionId, fresh)
    -> changeRestrictionsInRaid()  -> mutates globals RestrictionInRaid limits
    -> getConfig(sessionId)  -> warms up per-session config cache
    -> stashController.initProfile()  -> discovers & stores main stash ID
    -> fixRepeatableQuestsForProfile()  -> removes broken repeatable quests
    -> getOffraidPosition() -> updateOffraidPosition()
```

### 6. Raid Start (overridden `MatchController.startLocalRaid`)

```
EventWatcher captures raid start:
  -> controller.syncLocationBase(locationBase, sessionId)
    -> updateSpawnPoints()  -> clears default Player spawns, adds position-specific spawns
    -> updateSpawnPointsForTransit()  -> if coming from transit, places player at transit target
    -> updateInfiltrationForPlayerSpawnPoints()  -> sets PTT Infiltration field for vanilla transit support
    -> updateLocationBaseExits()  -> replaces all exits with position-specific extract list
    -> updateLocationBaseTransits()  -> optionally disables all vanilla transits
  -> initRaidCache()  -> tracks current location and player side (PMC/Scav)
```

### 7. Raid End (overridden `MatchCallbacks.endLocalRaid`)

```
EventWatcher captures raid end:
  -> parses exitName to extract: offraid position | transit map + spawn point
  -> restores original exitName in the data passed to vanilla handler
  -> EndOfRaidController.end(payload)
    -> if player died: controller.onPlayerDies() -> maybe resets position
    -> if extract: controller.onPlayerExtracts()
      -> KeepFoundInRaidTweak.setFoundInRaidOnEquipment()  -> FIR preservation
      -> updateOffraidPosition(newPosition)
    -> if transit: position unchanged (vanilla/PTT transit)
```

### 8. Offraid Position Update (`controller.updateOffraidPosition`)

```
profile.PathToTarkov.offraidPosition = newValue
stashController.updateStash(position, sessionId)
  -> determines main stash available vs secondary stash needed
  -> updates Inventory.stash and slot IDs
tradersController.updateTraders(...)
  -> for each trader: check access_via  && quest-availability -> set unlocked
saveServer.saveProfile(sessionId)
```

### 9. Map/Data Overrides (per session, on each request)

When `LocationController.generateAll` is called:
```
createGenerateAll() -> for each map:
  -> if not in position's infiltrations: set Locked=true, Enabled=false
  -> syncLocationBase()  -> update spawns, exits, transits
```

When `DataCallbacks.*` is called:
- `getTemplateItems` -> overrides stash size (cellsV) for secondary stashes
- `getHideoutAreas` -> disables/enables hideout areas based on stash access
- `getGlobals` -> conditionally zeroes hydration/energy/health regen; enforces flea market mode

When `RagfairCallbacks.*` is called (search, addOffer, extendOffer, getMarketPrice, getFleaPrices):
```
  -> temporarily adjusts globals.config.RagFair.minUserLevel per player location
  -> resets after the operation
```

### 10. Client Data Requests

`/PathToTarkov/CurrentLocationData`:
```
  -> resolve map name from locationId
  -> getExfilsTargets(controller, config, mapName, locationBase)
    -> for each extract in config.exfiltrations[mapName]:
      -> resolve exfil targets (offraid position or transit notation)
      -> compute nextMaps (other accessible maps from that position)
      -> compute nextTraders (traders accessible at that position, filtered by installation & non-wildcard)
  -> return ExfilsTargets
```

---

## Integration

### Consumers

- **PTT-Plugin**: Client-side BepInEx plugin for Escape from Tarkov. Consumes:
  - `ExfilsTargets` from `/PathToTarkov/CurrentLocationData` for UI display of extract destinations, next maps, and next traders
  - Version info from `/PathToTarkov/Version` for compatibility checking
  - Injected locale strings (exfil tooltips, prompt templates, offraid position names) in the game DB
  - Custom exfil names with dot-notation for offraid position / transit routing

### Key SPT Services Consumed

| Service | Usage |
|---|---|
| `DatabaseServer` | Read/write traders, locales, globals, templates, hideout areas, locations |
| `SaveServer` | Read/write player profiles (offraid position, stash ID, traders) |
| `ConfigServer` | SPT config for insurance and trader settings |
| `StaticRouterModService` | Register custom HTTP routes and route-peeking handlers |
| `MatchController` | Override `startLocalRaid` for spawn/exit sync |
| `MatchCallbacks` | Override `endLocalRaid` for exit name parsing and position update |
| `LocationController` | Override `generateAll` for map lock/unlock |
| `DataCallbacks` | Override `getTemplateItems`, `getHideoutAreas`, `getGlobals` |
| `RagfairCallbacks` | Override `search`, `addOffer`, `extendOffer`, `getMarketPrice`, `getFleaPrices` for location-based flea market |
| `RepeatableQuestGenerator` | Override `generateRepeatableQuest` to prevent locked-trader crashes |
| `WinstonLogger` | Logging |
| `JsonUtil` | JSON5 deserialization/serialization |

### Other Mods

- `PathToTarkovAPI` on `globalThis` (optional/legacy, gated by `enable_legacy_ptt_api`) -- deprecated since 5.2.0, allows other mods to read/write config and refresh.
