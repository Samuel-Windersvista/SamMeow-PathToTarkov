# Services Directory — Code Map

## Responsibility

The `src/services/` directory contains reusable, single-purpose utility classes that encapsulate discrete concerns for the PathToTarkov mod. Each service is stateless (or stateful only via explicit `init()`), framework-agnostic, and designed to be composed by the `PathToTarkovController`.

Three services live here:

| Service | Concern |
|---|---|
| `TradersAvailabilityService` | Trader unlock gating based on quest completion |
| `LocaleResolver` | Case-insensitive locale key resolution |
| `ExfilsTooltipsTemplater` | Localized exfiltration tooltip generation with template substitution |

---

## Design

### TradersAvailabilityService

**File:** `TradersAvailabilityService.ts`

Exposes a two-phase lifecycle:

1. `init(quests: Record<string, IQuest>)` — Scans all quest rewards of type `TraderUnlock` and builds an inverted index (`TradersLockedByQuests`) mapping `traderId -> questId -> true`. Returns `this` for chaining.

2. `isAvailable(traderId, pmcQuests: IQuestStatus[])` — Looks up whether the trader has any unlock quest requirement. If none exist, returns `true` (trader is available by default). Otherwise, checks if the PMC's quest list contains any completed quest (`status === 4`, i.e. `QUEST_STATUS_SUCCESS`) that is in the unlock set.

**Error handling:** Throws if `isAvailable` is called before `init`.

**Internal types:**
- `Quests = Record<string, IQuest>`
- `TradersLockedByQuests = Record<traderId, Record<questId, true>>`

---

### LocaleResolver

**File:** `LocaleResolver.ts`

A lightweight lookup utility that maps lower-cased locale keys back to their original (case-sensitive) key. This is necessary because BSG locale keys like `"EXFIL_Train"` may appear with different casing in user-facing strings.

**Constructor:** `constructor(allLocales: AllLocalesInDb)` — Pre-computes a `LocaleKeysLowerCaseMapping` object during construction by iterating every locale entry and storing `lowercaseKey -> originalKey`.

**Public API:**
- `retrieveKey(exfilName: string, locale: LocaleName): string` — Returns the original key for a lower-cased lookup. Falls back to the raw `exfilName` if not found.

**Type export:** `AllLocalesInDb = Record<string, Record<string, string>>` is used by both `ExfilsTooltipsTemplater` and `helpers.ts`.

---

### ExfilsTooltipsTemplater

**File:** `ExfilsTooltipsTemplater.ts`

Generates localized tooltip strings for exfiltration points. Uses a `$exfilDisplayName` / `$offraidPositionDisplayName` template substitution system.

**Constructor:** `constructor(allLocales: AllLocalesInDb)` — Deep-clones all locale data into `this.snapshotLocales` and instantiates a `LocaleResolver`.

**Public API:**
- `computeLocales(config: MinimumConfigForTooltipsTemplater): Partial<AllLocalesInDb>` — Iterates every locale, every map, and every exfil in the config to produce a set of new/overridden locale entries (both vanilla key overrides and custom `PTT_EXTRACT_<map>.<exfil>` keys).
- `debugTooltipsForLocale(locale: string, config): Record<string, string>` — Runs `computeLocales`, merges into a fresh locale record, and returns only keys starting with `PTT_`.

**Static methods (also consumed externally by `PathToTarkovController`):**
- `resolveOffraidPositionDisplayName(config, params)` — Resolves the `displayName` from `offraid_positions` config (by-locale with `DEFAULT_FALLBACK_LANGUAGE` fallback), falling back to the raw `offraidPosition` string.
- `resolveExfilDisplayName(config, params)` — Resolves exfil `displayName` from `exfiltrations_config`.
- `resolveTooltipsTemplate(config, params)` — Resolves the effective template string: per-exfil `override_tooltips_template` -> global `exfiltrations_tooltips_template` -> `$exfilDisplayName`.

**Template variables:**
| Variable | Source |
|---|---|
| `$exfilDisplayName` | Config override -> vanilla locale value -> `PTT_ERROR_EXFIL_LOCALE_NOT_FOUND` |
| `$offraidPositionDisplayName` | Config `offraid_positions` displayName -> raw offraid position string |

**Constants:**
- `ERROR_NO_EXFIL = 'PTT_ERROR_EXFIL_LOCALE_NOT_FOUND'` — sentinel used in locale output when a display name cannot be resolved.

---

## Flow

### Instantiation and Lifecycle

```
mod.ts (preSptLoad)
  |
  +-- new TradersAvailabilityService()
  |     passed to PathToTarkovController constructor
  |     (also constructed separately in uninstall.ts purgeProfiles)
  |
  +-- new PathToTarkovController(...)
        |
        +-- constructor:
        |     this.tradersAvailabilityService = new TradersAvailabilityService()
        |     (replaces the one received from mod.ts — see note below)
        |     this.tooltipsTemplater = undefined  // lazy init
        |
        +-- loaded(config) [called from postSptLoad]:
        |     this.tradersAvailabilityService.init(quests)
        |     this.injectTooltipsInLocales(config)
        |       -> getTooltipsTemplater()  [lazy creates ExfilsTooltipsTemplater]
        |       -> templater.computeLocales(config)
        |       -> mutateLocales(allLocales, partialLocales)
        |     this.injectOffraidPositionDisplayNamesInLocales(config)
        |       -> ExfilsTooltipsTemplater.resolveOffraidPositionDisplayName() [static]
        |
        +-- on various events (offraid position change, player extract):
              this.tradersController.updateTraders(...)
                -> this.tradersAvailabilityService.isAvailable(...)
```

**Key observation:** The controller's constructor discards the `TradersAvailabilityService` passed from `mod.ts` and creates a fresh one (line 112). This is likely a refactoring residue — currently harmless since both paths produce an uninitialized instance.

### LocaleResolver Instantiation

`LocaleResolver` is **never** instantiated by the controller or any consumer directly. It is only created inside `ExfilsTooltipsTemplater`'s constructor:

```
ExfilsTooltipsTemplater
  -> new LocaleResolver(allLocales)  // used internally only
```

---

## Integration

### Dependencies (SPT Interfaces)

| Service | SPT Dependencies |
|---|---|
| `TradersAvailabilityService` | `IQuestStatus`, `IQuest` (types only) |
| `LocaleResolver` | None (pure utility over locale records) |
| `ExfilsTooltipsTemplater` | None (operates on config + locale data) |

Runtime dependencies are injected into the **consumers**, not the services:

| Consumer | Injected SPT Services |
|---|---|
| `PathToTarkovController` | `DatabaseServer`, `SaveServer`, `ConfigServer`, `ILogger` |
| `TradersController` | `DatabaseServer`, `SaveServer`, `ConfigServer`, `ILogger` |

### Consumers

| Consumer | Uses | How |
|---|---|---|
| `PathToTarkovController` | `TradersAvailabilityService` | Holds instance; calls `init()` in `loaded()` and delegates to `TradersController.updateTraders()` |
| `PathToTarkovController` | `ExfilsTooltipsTemplater` | Lazy-init via `getTooltipsTemplater()`; calls `computeLocales()` for locale injection; calls static `resolveOffraidPositionDisplayName()` directly |
| `PathToTarkovController` | `LocaleResolver` | Uses only the exported `AllLocalesInDb` type; never instantiates the class |
| `TradersController` | `TradersAvailabilityService` | Receives via constructor injection; calls `isAvailable()` during `updateTraders()` |
| `uninstall.ts` (purgeProfiles) | `TradersAvailabilityService` | Direct instantiation: `new TradersAvailabilityService().init(quests)` |
| `tests/configs.test.ts` | `ExfilsTooltipsTemplater` | Direct instantiation for test validation of locale output |

### Internal Module Dependencies

| Service | Imports from |
|---|---|
| `TradersAvailabilityService` | `../utils` (`isEmpty`) |
| `LocaleResolver` | `../config` (`LocaleName` type) |
| `ExfilsTooltipsTemplater` | `../exfils-targets` (`parseExilTargetFromPTTConfig`), `../config` (locale/types), `../utils` (`deepClone`), `../helpers` (`mutateLocales`), `./LocaleResolver` |
