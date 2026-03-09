/* Void Meridian — Ship Management Engine */

const ShipEngine = {
  HULL_THRESHOLDS: [
    { percent: 75, message: 'Hull integrity dropping. Minor breaches detected.' },
    { percent: 50, message: 'Significant hull damage. Non-essential sections venting.' },
    { percent: 25, message: 'Critical hull damage! Emergency bulkheads engaged.' },
    { percent: 10, message: 'Hull failure imminent. Abandon ship protocols available.' },
  ],

  takeDamage(amount) {
    const ship = GameState.run.ship;
    const prevPercent = (ship.hull / ship.maxHull) * 100;
    ship.hull = Math.max(0, ship.hull - amount);
    const newPercent = (ship.hull / ship.maxHull) * 100;

    // Check threshold crossings
    for (const threshold of this.HULL_THRESHOLDS) {
      if (prevPercent > threshold.percent && newPercent <= threshold.percent) {
        GameState.addLog('system', threshold.message);

        // Random system damage at critical thresholds
        if (threshold.percent <= 50 && Math.random() < 0.4) {
          const systems = Object.keys(ship.baseSystems);
          const target = systems[Math.floor(Math.random() * systems.length)];
          this.damageSystem(target);
        }
      }
    }

    // Check destruction
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
    GameState.addLog('system', `${systemName.toUpperCase()} system damaged!`);
  },

  repairSystem(systemName) {
    const ship = GameState.run.ship;
    const sys = ship.baseSystems[systemName];
    if (!sys || !sys.damaged) return;

    sys.damaged = false;
    GameState.addLog('system', `${systemName.toUpperCase()} system repaired.`);
  },

  addModule(moduleId) {
    const mod = Registry.getModule(moduleId);
    if (!mod) return false;

    GameState.run.ship.equippedModules.push({ ...mod });
    GameState.addLog('system', `Module installed: ${mod.name}`);

    // Apply passive effects
    if (mod.effects) {
      for (const effect of mod.effects) {
        if (effect.type === 'maxHull') {
          GameState.run.ship.maxHull += effect.value;
          GameState.run.ship.hull += effect.value;
        }
      }
    }
    return true;
  },

  removeModule(moduleId) {
    const idx = GameState.run.ship.equippedModules.findIndex(m => m.id === moduleId);
    if (idx === -1) return false;

    const mod = GameState.run.ship.equippedModules.splice(idx, 1)[0];
    GameState.addLog('system', `Module removed: ${mod.name}`);
    return true;
  },

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

  nexusForceIntegrate(moduleId) {
    const mod = Registry.getModule(moduleId);
    if (!mod) return;

    GameState.run.ship.equippedModules.push({ ...mod, nexusIntegrated: true });
    GameState.run.ship.nexusIntegrations.push(moduleId);
    GameState.addLog('nexus', `The Nexus has integrated something into your ship: ${mod.name}`);

    Overlay.showNexusTransmission('i improved you. you are welcome.', 3000);
  },
};
