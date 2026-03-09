/* Void Meridian — Ship Management Engine */

const ShipEngine = {
  HULL_THRESHOLDS: [
    { percent: 75, message: 'Hull integrity dropping. Minor breaches detected.' },
    { percent: 50, message: 'Significant hull damage. Non-essential sections venting.' },
    { percent: 25, message: 'Critical hull damage! Emergency bulkheads engaged.' },
    { percent: 10, message: 'Hull failure imminent. Abandon ship protocols available.' },
  ],

  SYSTEM_NAMES: {
    weapons: 'Weapons',
    propulsion: 'Propulsion',
    sensors: 'Sensors',
    shields_armor: 'Shields / Armor',
    cargo_hold: 'Cargo Hold',
    crew_quarters: 'Crew Quarters',
  },

  // ─── Hull Damage ──────────────────────────────────────────────

  takeDamage(amount) {
    const ship = GameState.run.ship;
    const prevPercent = (ship.hull / ship.maxHull) * 100;
    ship.hull = Math.max(0, ship.hull - amount);
    const newPercent = (ship.hull / ship.maxHull) * 100;

    for (const threshold of this.HULL_THRESHOLDS) {
      if (prevPercent > threshold.percent && newPercent <= threshold.percent) {
        GameState.addLog('system', threshold.message);

        if (threshold.percent <= 50 && Math.random() < 0.4) {
          const systems = Object.keys(ship.baseSystems);
          const target = systems[Math.floor(Math.random() * systems.length)];
          this.damageSystem(target);
        }
      }
    }

    if (ship.hull <= 0) {
      GameState.addLog('system', 'The Meridian breaks apart.');
    }
  },

  repair(amount) {
    const ship = GameState.run.ship;
    ship.hull = Math.min(ship.maxHull, ship.hull + amount);
  },

  damageSystem(systemName) {
    const ship = GameState.run.ship;
    const sys = ship.baseSystems[systemName];
    if (!sys || sys.damaged) return;

    sys.damaged = true;
    const displayName = this.SYSTEM_NAMES[systemName] || systemName;
    GameState.addLog('system', `${displayName} system damaged!`);
  },

  repairSystem(systemName) {
    const ship = GameState.run.ship;
    const sys = ship.baseSystems[systemName];
    if (!sys || !sys.damaged) return;

    sys.damaged = false;
    const displayName = this.SYSTEM_NAMES[systemName] || systemName;
    GameState.addLog('system', `${displayName} system repaired.`);
  },

  // ─── Weapon Management ────────────────────────────────────────

  equipWeapon(weaponId) {
    const wpn = Registry.getWeapon(weaponId);
    if (!wpn) return false;

    if (wpn.gating && wpn.gating.requires && !Registry.checkGating(wpn.gating.requires)) {
      return false;
    }

    const instance = JSON.parse(JSON.stringify(wpn));
    if (typeof instance.stats.ammo === 'number') {
      instance._currentAmmo = instance.stats.ammo;
    }
    if (instance.stats.special_charges > 0) {
      instance._currentCharges = instance.stats.special_charges;
    }

    GameState.run.ship.equippedWeapons.push(instance);
    GameState.addLog('system', `Weapon equipped: ${wpn.name}`);

    if (wpn.nexus_flavor) {
      Overlay.showNexusTransmission(wpn.nexus_flavor, 3500);
    }

    return true;
  },

  unequipWeapon(weaponId) {
    const weapons = GameState.run.ship.equippedWeapons;
    const idx = weapons.findIndex(w => w.id === weaponId);
    if (idx === -1) return false;

    const wpn = weapons[idx];
    if (wpn.irremovable) {
      GameState.addLog('system', `${wpn.name} cannot be removed. [⬡]`);
      return false;
    }

    weapons.splice(idx, 1);
    GameState.addLog('system', `Weapon removed: ${wpn.name}`);
    return true;
  },

  getEquippedWeapons() {
    return GameState.run.ship.equippedWeapons;
  },

  // ─── Module Management ────────────────────────────────────────

  addModule(moduleId) {
    const mod = Registry.getModule(moduleId);
    if (!mod) return false;

    if (mod.gating_requires && !Registry.checkGating(mod.gating_requires)) {
      return false;
    }

    const instance = JSON.parse(JSON.stringify(mod));
    GameState.run.ship.equippedModules.push(instance);
    GameState.addLog('system', `Module installed: ${mod.name} → ${this.SYSTEM_NAMES[mod.slots_onto] || mod.slots_onto}`);

    return true;
  },

  removeModule(moduleId) {
    const modules = GameState.run.ship.equippedModules;
    const idx = modules.findIndex(m => m.id === moduleId);
    if (idx === -1) return false;

    const mod = modules[idx];
    if (mod.irremovable) {
      GameState.addLog('system', `${mod.name} cannot be removed. [⬡]`);
      return false;
    }

    modules.splice(idx, 1);
    GameState.addLog('system', `Module removed: ${mod.name}`);
    return true;
  },

  hasModule(moduleId) {
    return GameState.run.ship.equippedModules.some(m => m.id === moduleId);
  },

  getModulesForSystem(systemKey) {
    return GameState.run.ship.equippedModules.filter(m => m.slots_onto === systemKey);
  },

  // ─── Nexus Integration ────────────────────────────────────────

  nexusForceIntegrate(moduleId) {
    const mod = Registry.getModule(moduleId);
    if (!mod) return;

    const instance = JSON.parse(JSON.stringify(mod));
    instance.irremovable = true;
    instance.nexus_integrated = true;

    GameState.run.ship.equippedModules.push(instance);
    GameState.run.ship.nexusIntegrations.push(moduleId);
    GameState.addLog('nexus', `The Nexus has integrated something into your ship: ${mod.name}`);

    Overlay.showNexusTransmission('i improved you. you are welcome.', 3000);
  },

  tickNexusResonance() {
    for (const mod of GameState.run.ship.equippedModules) {
      if (!mod.nexus_integrated) continue;
      const match = (mod.effect || '').match(/[Gg]enerates?\s+(\d+)\s+[Rr]esonance/);
      if (match) {
        const amount = parseInt(match[1], 10);
        GameState.meta.resonance += amount;
      }
    }
  },

  // ─── Visual Stage ─────────────────────────────────────────────

  updateVisualStage() {
    const ship = GameState.run.ship;
    const depth = GameState.run.depth;
    const maxDepth = GameState.run.map ? GameState.run.map.maxDepth : 30;
    const progress = depth / maxDepth;

    if (progress >= 0.66 && ship.visualStage < 3) {
      ship.visualStage = 3;
      GameState.addLog('system', 'The Meridian has changed. You can feel it.');
    } else if (progress >= 0.33 && ship.visualStage < 2) {
      ship.visualStage = 2;
      GameState.addLog('system', 'The ship looks different now. Battle-worn, but stronger.');
    }
  },
};
