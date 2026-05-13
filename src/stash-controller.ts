import type { DatabaseServer } from '@spt/servers/DatabaseServer';
import type { SaveServer } from '@spt/servers/SaveServer';
import type { AccessVia, ConfigGetter, Profile, StashConfig, UserConfig } from './config';
import { EMPTY_STASH, ROAMING_EMERGENCY_STASH, STANDARD_STASH_ID } from './config';
import {
  checkAccessVia,
  getMainStashId,
  retrieveMainStashIdFromItems,
  setInventorySlotIds,
} from './helpers';
import { deepClone } from './utils';

export class StashController {
  constructor(
    private getConfig: ConfigGetter,
    private userConfig: UserConfig,
    private db: DatabaseServer,
    private saveServer: SaveServer,
    private readonly debug: (data: string) => void,
  ) {}

  initSecondaryStashTemplates(givenStashConfigs: StashConfig[]): number {
    const stashConfigs = [EMPTY_STASH, ROAMING_EMERGENCY_STASH, ...givenStashConfigs];
    const standardTemplate = this.db.getTables()?.templates?.items[STANDARD_STASH_ID];

    if (!standardTemplate) {
      throw new Error('Path To Tarkov: standard stash template not found');
    }

    let nbAddedTemplates = 0;

    stashConfigs.forEach(({ name, mongoTemplateId, mongoGridId, size }) => {
      const newTemplate = deepClone(standardTemplate);

      newTemplate._id = mongoTemplateId;
      newTemplate._name = `${name} of size ${size}`;

      const grid = newTemplate?._props?.Grids?.[0];
      const gridProps = grid?._props;

      if (gridProps) {
        grid._id = mongoGridId;
        grid._parent = mongoTemplateId;
        gridProps.cellsV = size;
      } else {
        throw new Error('Path To  Tarkov: cannot set size on custom stash template');
      }

      const items = this.db.getTables()?.templates?.items;

      if (items) {
        items[newTemplate._id] = newTemplate;
        nbAddedTemplates = nbAddedTemplates + 1;
      }
    });

    return nbAddedTemplates;
  }

  initProfile(sessionId: string): void {
    const profile: Profile = this.saveServer.getProfile(sessionId);
    const pmc = profile.characters.pmc;

    if (!profile.PathToTarkov) {
      profile.PathToTarkov = {};
    }

    const initialMainStashId = profile.PathToTarkov.mainStashId;

    if (!initialMainStashId) {
      const allStashConfigs = [EMPTY_STASH, ROAMING_EMERGENCY_STASH, ...this.getConfig(sessionId).hideout_secondary_stashes];
      const mainStashId = retrieveMainStashIdFromItems(pmc.Inventory.items, allStashConfigs);
      profile.PathToTarkov.mainStashId = mainStashId ?? pmc.Inventory.stash;
    }
  }

  private setMainStash(profile: Profile): void {
    const mainStashId = getMainStashId(profile);

    const inventory = profile.characters.pmc.Inventory;
    inventory.stash = mainStashId;
  }

  private setSecondaryStash(stash: Omit<StashConfig, 'access_via'>, profile: Profile): void {
    const stashId = stash.mongoId;
    const templateId = stash.mongoTemplateId;

    const inventory = profile.characters.pmc.Inventory;
    inventory.stash = stashId;

    if (!inventory.items.find(item => item._id === stashId && item._tpl === templateId)) {
      inventory.items.push({ _id: stashId, _tpl: templateId });
    }
  }

  private getMainStashAccessVia(sessionId: string): AccessVia {
    const defaultMainStashAccessVia = this.getConfig(sessionId).hideout_main_stash_access_via;
    const profile: Profile = this.saveServer.getProfile(sessionId);
    const profileTemplateId = profile.info.edition;

    const overrideByProfiles = this.getConfig(sessionId).override_by_profiles?.[profileTemplateId];

    return overrideByProfiles?.hideout_main_stash_access_via ?? defaultMainStashAccessVia;
  }

  private getMainStashAvailable(offraidPosition: string, sessionId: string): boolean {
    const multiStashEnabled = this.userConfig.gameplay.multistash;

    if (!multiStashEnabled) {
      return true;
    }

    const mainStashAccessVia = this.getMainStashAccessVia(sessionId);
    return checkAccessVia(mainStashAccessVia, offraidPosition);
  }

  private getSecondaryStash(
    offraidPosition: string,
    sessionId: string,
  ): Omit<StashConfig, 'access_via'> {
    return (
      this.getConfig(sessionId).hideout_secondary_stashes.find(stash =>
        checkAccessVia(stash.access_via, offraidPosition),
      ) ?? ROAMING_EMERGENCY_STASH
    );
  }

  updateStash(offraidPosition: string, sessionId: string): void {
    const mainStashAvailable = this.getMainStashAvailable(offraidPosition, sessionId);
    const secondaryStash = this.getSecondaryStash(offraidPosition, sessionId);
    const profile: Profile = this.saveServer.getProfile(sessionId);

    if (mainStashAvailable) {
      this.setMainStash(profile);
    } else {
      this.setSecondaryStash(secondaryStash, profile);
    }

    const inventory = profile.characters.pmc.Inventory;
    const stashId = inventory.stash;
    const secondaryStashes = [ROAMING_EMERGENCY_STASH, ...this.getConfig(sessionId).hideout_secondary_stashes];

    setInventorySlotIds(profile, stashId, secondaryStashes);
  }

  getStashSize(offraidPosition: string, sessionId: string): number | null {
    const mainStashAvailable = this.getMainStashAvailable(offraidPosition, sessionId);
    const secondaryStash = this.getSecondaryStash(offraidPosition, sessionId);

    if (mainStashAvailable) {
      return null;
    }

    return secondaryStash.size;
  }

  getHideoutEnabled(offraidPosition: string, sessionId: string): boolean {
    return this.getMainStashAvailable(offraidPosition, sessionId);
  }

  private shouldUseRoamingEmergencyStash(offraidPosition: string, sessionId: string): boolean {
    const mainStashAvailable = this.getMainStashAvailable(offraidPosition, sessionId);

    if (mainStashAvailable) {
      return false;
    }

    const secondaryStash = this.getSecondaryStash(offraidPosition, sessionId);
    return secondaryStash.mongoId === ROAMING_EMERGENCY_STASH.mongoId;
  }

  public isRoamingEmergencyStashActive(sessionId: string): boolean {
    const profile: Profile = this.saveServer.getProfile(sessionId);
    return profile.characters.pmc.Inventory.stash === ROAMING_EMERGENCY_STASH.mongoId;
  }

  public clearRoamingEmergencyStashOnExit(nextOffraidPosition: string, sessionId: string): number {
    // Return 0 if current stash is not roaming emergency stash
    if (!this.isRoamingEmergencyStashActive(sessionId)) {
      return 0;
    }

    // Return 0 if next position still resolves to roaming fallback
    if (this.shouldUseRoamingEmergencyStash(nextOffraidPosition, sessionId)) {
      return 0;
    }

    const profile: Profile = this.saveServer.getProfile(sessionId);
    const inventory = profile.characters.pmc.Inventory;
    const roamingMongoId = ROAMING_EMERGENCY_STASH.mongoId;

    // Build set of descendant IDs to remove (root itself is kept)
    // Start with the root as the ancestor anchor, but not in the removal set
    const ancestorIds = new Set<string>([roamingMongoId]);
    const idsToRemove = new Set<string>();

    // Iteratively find all descendants whose parent chain traces back to roaming stash root
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of inventory.items) {
        const parentId = (item as unknown as { parentId?: string }).parentId;
        if (parentId && ancestorIds.has(parentId) && !ancestorIds.has(item._id)) {
          ancestorIds.add(item._id);
          idsToRemove.add(item._id);
          changed = true;
        }
      }
    }

    // Remove matching items and count (root excluded from removal set)
    let removedCount = 0;
    inventory.items = inventory.items.filter(item => {
      if (idsToRemove.has(item._id)) {
        removedCount = removedCount + 1;
        return false;
      }
      return true;
    });

    return removedCount;
  }
}
