import { StashController } from '../src/stash-controller';
import { getPTTMongoId } from '../src/utils';
import { EMPTY_STASH, STANDARD_STASH_ID } from '../src/config';
import type { Config, UserConfig, Profile } from '../src/config';

// ─── Derive expected roaming emergency stash IDs ───
// These must match what the future toStashConfig({ id: 'PathToTarkov_Roaming_Emergency_Stash', ... }) produces.

const ROAMING_NAME = 'PathToTarkov_Roaming_Emergency_Stash';
const expectedRoamingMongoId = getPTTMongoId(ROAMING_NAME);
const expectedRoamingTemplateId = getPTTMongoId(`template_${ROAMING_NAME}`);
const expectedRoamingGridId = getPTTMongoId(`grid_${ROAMING_NAME}`);

// ─── Mock standard stash template ───

const STANDARD_STASH_TEMPLATE = {
  _id: STANDARD_STASH_ID,
  _name: 'Stash_Standard',
  _props: {
    Grids: [
      {
        _id: 'grid_standard',
        _parent: STANDARD_STASH_ID,
        _props: { cellsH: 10, cellsV: 28 },
      },
    ],
  },
};

describe('StashController roaming emergency stash', () => {
  describe('initSecondaryStashTemplates', () => {
    it('registers roaming emergency stash template with size 20', () => {
      // ── Mock DatabaseServer ──
      const mockItemsDb: Record<string, unknown> = {
        [STANDARD_STASH_ID]: JSON.parse(JSON.stringify(STANDARD_STASH_TEMPLATE)),
      };

      const mockDb = {
        getTables: () => ({ templates: { items: mockItemsDb } }),
      };

      // ── Instantiate StashController ──
      const controller = new StashController(
        () => ({}) as Config, // getConfig — not used by initSecondaryStashTemplates
        {} as UserConfig, // userConfig — not used by initSecondaryStashTemplates
        mockDb as never,
        {} as never,
        () => {}, // debug
      );

      // ── Act: register templates (no user-defined secondaries) ──
      controller.initSecondaryStashTemplates([]);

      // ── Assert: roaming emergency stash template (size 20) should be registered ──
      const roamingTemplate = mockItemsDb[expectedRoamingTemplateId];
      expect(roamingTemplate).toBeDefined();

      const template = roamingTemplate as {
        _name: string;
        _props?: { Grids?: Array<{ _id: string; _props: { cellsV: number } }> };
      };
      expect(template._name).toContain('size 20');

      const grid = template._props?.Grids?.[0];
      expect(grid).toBeDefined();
      if (grid) {
        expect(grid._props.cellsV).toBe(20);
        expect(grid._id).toBe(expectedRoamingGridId);
      }
    });
  });

  describe('updateStash fallback', () => {
    it('falls back to roaming emergency stash when no main/secondary stash matches', () => {
      // ── Setup: offraid position that has NEITHER main stash NOR secondary stash ──
      const ROAMING_POSITION = 'woods_FactGate_factory_Mtent';
      const MAIN_ONLY_POSITIONS = ['PlayerHideout']; // roaming position NOT in this list

      // ── Mock profile ──
      const profile = {
        info: { id: 'test_pmc', username: 'test_user', edition: 'Edge Of Darkness' },
        characters: {
          pmc: {
            _id: 'test_pmc',
            Info: { Level: 1 },
            Inventory: {
              items: [] as Record<string, unknown>[],
              stash: STANDARD_STASH_ID,
            },
            Quests: [],
            RepeatableQuests: [],
          },
          scav: {},
        },
        PathToTarkov: {},
      } as unknown as Profile;

      const mockSaveServer = {
        getProfile: (_sessionId: string) => profile,
      };

      // ── Mock config: main stash only accessible at PlayerHideout; no secondary stashes defined ──
      const mockConfig = {
        hideout_main_stash_access_via: MAIN_ONLY_POSITIONS,
        hideout_secondary_stashes: [],
      } as unknown as Config;

      const mockUserConfig: UserConfig = {
        selectedConfig: 'Default',
        gameplay: {
          multistash: true,
          tradersAccessRestriction: true,
          resetOffraidPositionOnPlayerDeath: true,
          playerScavMoveOffraidPosition: false,
          keepFoundInRaidTweak: true,
          fleaMarketMode: 'everywhere',
          fleaMarketMinLevel: 15,
        },
      };

      // ── Instantiate StashController ──
      const controller = new StashController(
        () => mockConfig,
        mockUserConfig,
        {} as never,
        mockSaveServer as never,
        () => {}, // debug
      );

      // ── Act: update stash at roaming position ──
      controller.updateStash(ROAMING_POSITION, 'test_session');

      // ── Assert: profile should use roaming emergency stash, NOT EMPTY_STASH ──
      expect(profile.characters.pmc.Inventory.stash).toBe(expectedRoamingMongoId);
      expect(profile.characters.pmc.Inventory.stash).not.toBe(EMPTY_STASH.mongoId);
    });
  });

  describe('clearRoamingEmergencyStashOnExit', () => {
    const MAIN_ONLY_POSITIONS = ['PlayerHideout'];

    // Forward-declared structural type for the future clear-on-exit method.
    // Narrows the cast from `any` to the exact signature expected.
    type ClearOnExitMethod = {
      clearRoamingEmergencyStashOnExit(nextOffraidPosition: string, sessionId: string): number;
    };

    const MULTISTASH_USER_CONFIG: UserConfig = {
      selectedConfig: 'Default',
      gameplay: {
        multistash: true,
        tradersAccessRestriction: true,
        resetOffraidPositionOnPlayerDeath: true,
        playerScavMoveOffraidPosition: false,
        keepFoundInRaidTweak: true,
        fleaMarketMode: 'everywhere',
        fleaMarketMinLevel: 15,
      },
    };

    function createRoamingItems() {
      return {
        root: { _id: expectedRoamingMongoId, _tpl: expectedRoamingTemplateId },
        directChild: {
          _id: 'direct_child_1',
          _tpl: 'fake_item_tpl',
          parentId: expectedRoamingMongoId,
          slotId: 'hideout',
        },
        nestedChild: {
          _id: 'nested_child_1',
          _tpl: 'fake_item_tpl_2',
          parentId: 'direct_child_1',
          slotId: 'hideout',
        },
      };
    }

    function buildProfileWithRoamingItems(): Profile {
      const { root, directChild, nestedChild } = createRoamingItems();
      return {
        info: { id: 'test_pmc', username: 'test_user', edition: 'Edge Of Darkness' },
        characters: {
          pmc: {
            _id: 'test_pmc',
            Info: { Level: 1 },
            Inventory: {
              items: [root, directChild, nestedChild] as Record<string, unknown>[],
              stash: expectedRoamingMongoId,
            },
            Quests: [],
            RepeatableQuests: [],
          },
          scav: {},
        },
        PathToTarkov: {},
      } as unknown as Profile;
    }

    it('recursively clears roaming emergency stash contents when leaving to PlayerHideout', () => {
      // ── Setup: profile with roaming stash root + direct child + nested child ──
      const profile = buildProfileWithRoamingItems();

      const mockSaveServer = {
        getProfile: (_sessionId: string) => profile,
      };

      const mockConfig = {
        hideout_main_stash_access_via: MAIN_ONLY_POSITIONS,
        hideout_secondary_stashes: [],
      } as unknown as Config;

      // ── Instantiate StashController ──
      const controller = new StashController(
        () => mockConfig,
        MULTISTASH_USER_CONFIG,
        {} as never,
        mockSaveServer as never,
        () => {},
      );

      // ── Act: clear roaming stash when exiting to PlayerHideout ──
      const nbCleared = (
        controller as unknown as ClearOnExitMethod
      ).clearRoamingEmergencyStashOnExit('PlayerHideout', 'test_session');

      // ── Assert: root item is kept, only descendant items are removed ──
      const items = profile.characters.pmc.Inventory.items;
      expect(nbCleared).toBe(2);
      expect(items.find(i => i._id === expectedRoamingMongoId)).toBeDefined();
      expect(items.find(i => i._id === 'direct_child_1')).toBeUndefined();
      expect(items.find(i => i._id === 'nested_child_1')).toBeUndefined();
      expect(items).toHaveLength(1);
    });

    it('does not clear roaming emergency stash contents when next position still uses roaming fallback', () => {
      const ROAMING_POSITION = 'woods_FactGate_factory_Mtent';

      // ── Setup: profile with roaming stash items ──
      const profile = buildProfileWithRoamingItems();

      const mockSaveServer = {
        getProfile: (_sessionId: string) => profile,
      };

      const mockConfig = {
        hideout_main_stash_access_via: MAIN_ONLY_POSITIONS,
        hideout_secondary_stashes: [],
      } as unknown as Config;

      // ── Instantiate StashController ──
      const controller = new StashController(
        () => mockConfig,
        MULTISTASH_USER_CONFIG,
        {} as never,
        mockSaveServer as never,
        () => {},
      );

      // ── Act: attempt to clear roaming stash when next position is still roaming ──
      const nbCleared = (
        controller as unknown as ClearOnExitMethod
      ).clearRoamingEmergencyStashOnExit(ROAMING_POSITION, 'test_session');

      // ── Assert: roaming stash items remain untouched ──
      const items = profile.characters.pmc.Inventory.items;
      expect(nbCleared).toBe(0);
      expect(items.find(i => i._id === expectedRoamingMongoId)).toBeDefined();
      expect(items.find(i => i._id === 'direct_child_1')).toBeDefined();
      expect(items.find(i => i._id === 'nested_child_1')).toBeDefined();
      expect(items).toHaveLength(3);
    });
  });
});
