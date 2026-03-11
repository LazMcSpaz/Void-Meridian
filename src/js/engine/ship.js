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

  // ─── Cargo Capacity ──────────────────────────────────────────

  getCargoCapacity() {
    var cargoLevel = GameState.run.ship.baseSystems.cargo_hold.level || 1;
    return cargoLevel * 3;
  },

  isCargoFull() {
    return GameState.run.ship.cargo.length >= this.getCargoCapacity();
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

    // Re-apply module effects so weapon damage bonuses apply to new weapon
    this.applyModuleEffects();

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

    this.applyModuleEffects();
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

    this.applyModuleEffects();
    return true;
  },

  // ─── Module Stat Effects ────────────────────────────────────────
  // Parses effect text strings and applies bonuses to ship state.
  // Called whenever modules are added or removed.

  applyModuleEffects() {
    const ship = GameState.run.ship;

    // Calculate max hull bonus from modules
    let hullBonus = 0;
    let weaponDmgBonus = 0;

    for (const mod of ship.equippedModules) {
      const eff = mod.effect || '';

      // +N Max Hull (e.g. Reinforced Bulkhead "+15 Max Hull")
      const hullMatch = eff.match(/\+(\d+)\s*Max Hull/i);
      if (hullMatch) hullBonus += parseInt(hullMatch[1], 10);

      // +N damage to weapons (e.g. Targeting Computer "+2 damage to all equipped weapons")
      const dmgMatch = eff.match(/\+(\d+)\s*damage/i);
      if (dmgMatch) weaponDmgBonus += parseInt(dmgMatch[1], 10);
    }

    // Apply max hull bonus
    // Base max hull is stored at allocation time; module bonuses are additive
    if (!ship._baseMaxHull) ship._baseMaxHull = ship.maxHull;
    const newMax = ship._baseMaxHull + hullBonus;
    if (newMax !== ship.maxHull) {
      const diff = newMax - ship.maxHull;
      ship.maxHull = newMax;
      // If max hull increased, also heal by the increase amount
      if (diff > 0) ship.hull = Math.min(ship.maxHull, ship.hull + diff);
      // If max hull decreased (module removed), cap current hull
      else ship.hull = Math.min(ship.maxHull, ship.hull);
    }

    // Apply weapon damage bonus
    // Store base damage on first calculation, then apply bonus on top
    for (const wpn of ship.equippedWeapons) {
      if (wpn._baseDamage == null) wpn._baseDamage = wpn.stats.damage;
      wpn.stats.damage = wpn._baseDamage + weaponDmgBonus;
    }
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
