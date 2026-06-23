# Repository Atlas: PathToTarkov

## Project Responsibility

PathToTarkov is a hybrid server + client mod for SPT (Single Player Tarkov) 3.11.x that turns the discrete map roster of Escape From Tarkov into a continuous open world. It introduces an `offraid position` state per player profile that gates map access, spawn points, stash access, hideout features, trader availability, flea market access, and offraid regeneration.

The repository contains:
- A TypeScript SPT server mod (`src/`)
- A C# BepInEx client plugin (`PTT-Plugin/`)
- A shared C# network packet library for co-op sync (`PTT-Packets/`)
- JSON5 configuration presets (`configs/`)
- Build, test, and documentation tooling

## System Entry Points

- `src/mod.ts` — SPT mod entry point implementing `IPreSptLoadMod`, `IPostSptLoadMod`, `IPostSptLoadMod` (legacy naming)
- `PTT-Plugin/Plugin.cs` — BepInEx client plugin entry point
- `PTT-Packets/Packets/*.cs` — LiteNetLib packet definitions consumed by `PTT-Plugin` and optional `PTT-Fika`
- `package.json` — npm scripts, dependencies, SPT version compatibility
- `PTT.sln` — Visual Studio solution grouping the C# projects

## Repository Directory Map

| Directory | Responsibility Summary | Detailed Map |
|-----------|------------------------|--------------|
| `src/` | Server-side TypeScript mod: config loading, route registration, SPT controller overrides, stash/trader/offraid logic | [View Map](src/codemap.md) |
| `src/services/` | Utility services for trader availability, locale resolution, and exfil tooltip templating | [View Map](src/services/codemap.md) |
| `src/routes/` | Static HTTP routes consumed by the client plugin (`/PathToTarkov/Version`, `/PathToTarkov/CurrentLocationData`) | [View Map](src/routes/codemap.md) |
| `src/_generated/` | Build-time generated vanilla exfil data used for validation and runtime fallback | [View Map](src/_generated/codemap.md) |
| `PTT-Plugin/` | Client-side BepInEx plugin: patches, UI, HTTP client, Fika bridge | [View Map](PTT-Plugin/codemap.md) |
| `PTT-Plugin/Services/` | Orchestration services: `CurrentLocationDataService`, `ExfilPromptService`, `FikaBridge`, etc. | [View Map](PTT-Plugin/Services/codemap.md) |
| `PTT-Plugin/Patches/` | Harmony/SPT Reflection patches on EFT internals (exfil filtering, raid lifecycle, trader UI) | [View Map](PTT-Plugin/Patches/codemap.md) |
| `PTT-Plugin/UI/` | Custom exfil prompt and tooltip rendering | [View Map](PTT-Plugin/UI/codemap.md) |
| `PTT-Plugin/Data/` | DTOs shared between client and server (`ExfilTarget`, `CurrentLocationDataResponse`, etc.) | [View Map](PTT-Plugin/Data/codemap.md) |
| `PTT-Plugin/Helpers/` | Logging, HTTP, transit, trader, player, sound, delayed-action utilities | [View Map](PTT-Plugin/Helpers/codemap.md) |
| `PTT-Plugin/Settings/` | BepInEx configuration bindings | [View Map](PTT-Plugin/Settings/codemap.md) |
| `PTT-Plugin/Attributes/` | ConfigurationManager display metadata | [View Map](PTT-Plugin/Attributes/codemap.md) |
| `PTT-Plugin/Scripts/` | Unity MonoBehaviour scripts (Kaeno TraderScrolling compatibility) | [View Map](PTT-Plugin/Scripts/codemap.md) |
| `PTT-Packets/` | Shared network packet library for multiplayer sync | [View Map](PTT-Packets/codemap.md) |
| `PTT-Packets/Packets/` | Per-packet type definitions and serialization | [View Map](PTT-Packets/Packets/codemap.md) |

## High-Level Data Flow

```
SPT server boots
  |
  +-- src/mod.ts preSptLoad
        +-- load UserConfig.json5 / config.json5 / shared_player_spawnpoints.json5
        +-- build PathToTarkovController
        +-- register HTTP routes
        +-- hook SPT LocationController / DataCallbacks / RagfairCallbacks
  |
  +-- Client plugin (PTT-Plugin) starts
        +-- Fetch server version via /PathToTarkov/Version
        +-- Enable patches
  |
  +-- Player enters raid
        +-- /PathToTarkov/CurrentLocationData returns exfil targets for current map
        +-- Client filters exfils and renders custom prompt via InteractableExfilsAPI
  |
  +-- Player extracts / transits
        +-- Client sends destination to server via end-of-raid route
        +-- Server updates offraid position, stash, traders, FIR tweak
```

## Key Cross-Cutting Concerns

- **Access control model**: `access_via` string/array with wildcard (`*`) used for stashes, traders, regen, flea market
- **Exfil target notation**: `ExtractName` or `ExtractName.mapName.spawnId` for transits
- **Per-session config cache**: `PathToTarkovController` clones base config per `sessionId`
- **Multiplayer sync**: `PTT-Packets` carries vote/transit/exfil packets over Fika's LiteNetLib pipeline

## Integration

- **Hard runtime dependency**: `InteractableExfilsAPI` client plugin (`Jehree.InteractableExfilsAPI >= 2.0.0`)
- **Optional runtime dependency**: `Fika.Core` (`com.fika.core >= 1.1.5`) for co-op support
- **SPT server APIs**: `LocationController`, `DataCallbacks`, `RagfairCallbacks`, `StaticRouterModService`, `ConfigServer`, `DatabaseServer`, `SaveServer`
- **EFT client APIs**: `ExfiltrationPoint`, `GameWorld`, `GamePlayerOwner`, `LocalGame`, `TransitControllerAbstractClass`
