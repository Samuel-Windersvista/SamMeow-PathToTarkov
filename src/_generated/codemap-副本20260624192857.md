# src/_generated/

## Responsibility

This folder holds auto-generated, read-only code that embeds vanilla EFT
exfiltration data directly into the TypeScript compilation. It gives Path To
Tarkov a compile-time-known set of valid extract point names per map, used for
config validation and as a runtime fallback when external resource JSON files
are not available on disk.

## Design

- **Single file**: `all-vanilla-exfils.ts`
- **Exported constant**: `ALL_DUMPED_EXFILS_FROM_SCRIPT` of type
  `Record<string, string[]>` keyed by simplified internal map names (`customs`,
  `factory`, `groundzero`, `interchange`, `laboratory`, `lighthouse`, `reserve`,
  `shoreline`, `streets`, `woods`). Each value is an array of vanilla extract
  identifiers (e.g. `"EXFIL_ZB013"`, `"Cellars"`, `"SE Exfil"`).
- **Generator tool**: `scripts/generate-all-exfils.js` -- a stand-alone Node.js
  script that reads four groups of data from `external-resources/`:
  - `maps/{map}_allExtracts.json` -- per-map JSON arrays of extract objects
    (field: `Name`)
  - `location_name_mapping.json` -- short name to display name mapping
  - `locales_global_en.json` -- English locale keys for resolving display names
    (used only by the markdown/docs variant, not the TypeScript variant)
  - `map_locations.json` -- MapGenie and fandom.com metadata (docs variant only)
- **Script modes**: `--javascript` writes the TypeScript file; `--markdown`
  writes `ALL_EXFILS.md` documentation.
- The merge step currently merges left vs. right maps-exits with dedup. The
  right-side argument is an empty object, so no merging actually occurs today.

## Flow

```
[SPT Server DB]         (dev machine only)
       |
       | npm run gather:external-resources
       | (scripts/gather-external-resources.sh)
       v
[ external-resources/ ]   (copied JSON: maps/*_allExtracts.json, locales, mapping files)
       |
       | npm run build:exfils
       | (node scripts/generate-all-exfils.js --javascript)
       v
[ src/_generated/all-vanilla-exfils.ts ]    AUTO-GENERATED
       |
       | imported by src/all-exfils.ts and src/exfils-targets.ts
       v
[ TypeScript build (tsc) ]
```

- `npm run gather:external-resources` copies raw JSON from an SPT server
  database checkout (`SPT_Data/Server/database/`) into `external-resources/`.
  This step is manual / developer-only; the resulting files are committed.
- `npm run build:exfils` runs the generator and pipes output to
  `src/_generated/all-vanilla-exfils.ts`, then runs prettier.
- `npm run build:all` chains `build:exfils` before the main `tsc` build,
  ensuring generated code is always up to date for compilation.

## Integration

### `src/all-exfils.ts` -- validation layer
Imports `ALL_DUMPED_EXFILS_FROM_SCRIPT`, adds SPT internal map-name aliases
(`bigmap` -> `customs`, `rezervbase` -> `reserve`, `factory4_day` /
`factory4_night` -> `factory`, `tarkovstreets` -> `streets`, `sandbox` /
`sandbox_high` -> `groundzero`), and exports `isValidExfilForMap(mapName,
exfilName): boolean`. This validator is consumed by `src/config-analysis.ts` to
reject user-provided extract names that don't exist in the vanilla game data.

### `src/exfils-targets.ts` -- runtime routing
Imports `ALL_DUMPED_EXFILS_FROM_SCRIPT` as a **fallback** inside
`getAllExtractsFromExternalResources()`. At runtime, the function first tries to
read `external-resources/maps/{map}_allExtracts.json` from disk (the same files
the generator consumed). If those files are unavailable (e.g. production
deployment without the dev external-resources directory), it falls back to the
same alias-expanded map built from the generated constant. The returned extract
list is iterated to build `ExfilTarget` objects for transit routing, offraid
position resolution, and trader access restriction checks.
