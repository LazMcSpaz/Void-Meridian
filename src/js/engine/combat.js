/* Void Meridian — Combat Engine */

const CombatEngine = {

  // Weapon type vs shield interaction
  SHIELD_INTERACTION: {
    ballistic:    'partial',   // shields reduce by 1
    energy:       'blocked',   // fully blocked by shields
    missile:      'bypass',    // ignores shields
    emp:          'bypass',    // affects systems, not hull
    nexus_energy: 'bypass',    // ignores shields
  },

  startCombat(enemyId) {
    const enemyDef = Registry.getEnemy(enemyId);
    const enemy = enemyDef ? { ...enemyDef } : this._genericEnemy();

    GameState.run.activeCombat = {
      enemy: {
        name: enemy.name || 'Unknown Vessel',
        emoji: enemy.emoji || '🚀',
        hull: enemy.hull || 50,
        maxHull: enemy.hull || 50,
        shields: enemy.shields || 0,
        maxShields: enemy.shields || 0,
        attack: enemy.attack || 8,
        defense: enemy.defense || 3,
        faction: enemy.faction || null,
        lootTable: enemy.lootTable || [],
        scanned: false,
        weakness: enemy.weakness || null,
      },
      turn: 1,
      playerTurn: true,
      playerDefending: false,
      playerEvading: false,
      lastAction: null,
      fled: false,
    };

    GameState.screen = 'combat';
    GameState.addLog('combat', `Engaged ${enemy.name || 'hostile vessel'}`);
    Game.render();
  },

  playerAction(station) {
    const combat = GameState.run.activeCombat;
    if (!combat || !combat.playerTurn) return;

    combat.playerDefending = false;
    combat.playerEvading = false;

    switch (station) {
      case 'weapons':
        this._playerAttack(combat);
        break;
      case 'defense':
        this._playerDefend(combat);
        break;
      case 'helm':
        this._playerEvade(combat);
        break;
      case 'engineering':
        this._playerRepair(combat);
        break;
      case 'tactical':
        this._playerScan(combat);
        break;
    }

    if (combat.enemy.hull <= 0) {
      this._victory(combat);
      return;
    }

    combat.playerTurn = false;
    Game.render();

    setTimeout(() => {
      this._enemyTurn(combat);
      combat.turn++;
      combat.playerTurn = true;

      if (GameState.run.ship.hull <= 0) {
        this._playerDestroyed();
        return;
      }

      Game.render();
    }, 800);
  },

  _playerAttack(combat) {
    const ship = GameState.run.ship;
    const weapons = ship.equippedWeapons;

    if (!weapons || weapons.length === 0) {
      // Fallback: base system attack
      const weaponLevel = ship.baseSystems.weapons.level;
      const gunner = GameState.run.crew.find(c => !c.dead && c.role === 'soldier');
      const crewBonus = gunner ? 2 : 0;
      const baseDamage = 5 + weaponLevel * 3 + crewBonus;
      const damage = Math.round(baseDamage * (0.7 + Math.random() * 0.6));
      const actualDamage = Math.max(1, damage - combat.enemy.defense);
      combat.enemy.hull = Math.max(0, combat.enemy.hull - actualDamage);
      combat.lastAction = `Weapons fire! ${actualDamage} damage dealt.`;
      return;
    }

    // Fire all equipped weapons
    let totalDamage = 0;
    const actions = [];

    for (const wpn of weapons) {
      // Check ammo
      if (typeof wpn._currentAmmo === 'number' && wpn._currentAmmo <= 0) {
        actions.push(`${wpn.name}: no ammo`);
        continue;
      }

      let damage = wpn.stats.damage || 2;

      // Crew bonus from soldier
      const gunner = GameState.run.crew.find(c => !c.dead && c.role === 'soldier');
      if (gunner) damage += 1;

      // Roll variance
      damage = Math.round(damage * (0.7 + Math.random() * 0.6));

      // Shield interaction
      const shieldMode = this.SHIELD_INTERACTION[wpn.type] || 'partial';
      if (combat.enemy.shields > 0) {
        if (shieldMode === 'blocked') {
          const shieldDmg = Math.min(damage, combat.enemy.shields);
          combat.enemy.shields = Math.max(0, combat.enemy.shields - shieldDmg);
          actions.push(`${wpn.name}: ${shieldDmg} to shields`);
          if (typeof wpn._currentAmmo === 'number') wpn._currentAmmo--;
          continue;
        } else if (shieldMode === 'partial') {
          damage = Math.max(1, damage - 1);
        }
      }

      const actualDamage = Math.max(1, damage - combat.enemy.defense);
      totalDamage += actualDamage;
      actions.push(`${wpn.name}: ${actualDamage} dmg`);

      if (typeof wpn._currentAmmo === 'number') wpn._currentAmmo--;
    }

    combat.enemy.hull = Math.max(0, combat.enemy.hull - totalDamage);
    combat.lastAction = actions.join(' | ');

    if (combat.enemy.scanned && combat.enemy.weakness === 'weapons') {
      const bonus = Math.round(totalDamage * 0.3);
      combat.enemy.hull = Math.max(0, combat.enemy.hull - bonus);
      combat.lastAction += ` Weakness +${bonus}!`;
    }
  },

  _playerDefend(combat) {
    combat.playerDefending = true;
    combat.lastAction = 'Shields raised. Incoming damage will be reduced.';
  },

  _playerEvade(combat) {
    combat.playerEvading = true;
    const pilot = GameState.run.crew.find(c => !c.dead && c.role === 'pilot');
    const chance = pilot ? 60 : 35;
    combat.lastAction = `Evasive maneuver. ${chance}% dodge chance.`;
  },

  _playerRepair(combat) {
    const engineer = GameState.run.crew.find(c => !c.dead && c.role === 'engineer');
    const repair = engineer ? 12 : 6;
    ShipEngine.repair(repair);
    combat.lastAction = `Emergency repairs: +${repair} hull.`;
  },

  _playerScan(combat) {
    if (combat.enemy.scanned) {
      combat.lastAction = 'Enemy already scanned.';
      return;
    }
    const scientist = GameState.run.crew.find(c => !c.dead && c.role === 'scientist');
    const techie = GameState.run.crew.find(c => !c.dead && c.role === 'technician');
    const successChance = (scientist || techie) ? 80 : 50;

    if (Math.random() * 100 < successChance) {
      combat.enemy.scanned = true;
      const weaknesses = ['weapons', 'shields', 'engines'];
      combat.enemy.weakness = weaknesses[Math.floor(Math.random() * weaknesses.length)];
      combat.lastAction = `Scan complete. Weakness: ${combat.enemy.weakness}.`;
    } else {
      combat.lastAction = 'Scan inconclusive. Try again next turn.';
    }
  },

  _enemyTurn(combat) {
    if (combat.playerEvading) {
      const pilot = GameState.run.crew.find(c => !c.dead && c.role === 'pilot');
      const dodgeChance = pilot ? 0.6 : 0.35;
      if (Math.random() < dodgeChance) {
        combat.lastAction = 'Enemy fires — you dodge the attack!';
        return;
      }
    }

    const baseDamage = combat.enemy.attack;
    let damage = Math.round(baseDamage * (0.6 + Math.random() * 0.8));

    if (combat.playerDefending) {
      const shieldLevel = GameState.run.ship.baseSystems.shields_armor.level;
      damage = Math.max(1, damage - shieldLevel * 2 - 3);
    }

    ShipEngine.takeDamage(damage);
    combat.lastAction = `${combat.enemy.name} attacks for ${damage} damage!`;
  },

  attemptFlee() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const pilot = GameState.run.crew.find(c => !c.dead && c.role === 'pilot');
    const propLevel = GameState.run.ship.baseSystems.propulsion.level;
    const fleeChance = 30 + propLevel * 8 + (pilot ? 15 : 0);

    if (Math.random() * 100 < fleeChance) {
      combat.fled = true;
      GameState.run.activeCombat = null;
      GameState.run.activeEvent = null;
      GameState.run.fuel = Math.max(0, GameState.run.fuel - 1);
      GameState.addLog('combat', 'Fled from combat.');
      GameState.screen = 'map';
      Tabs.activeTab = 'map';
      Game.render();
    } else {
      combat.lastAction = 'Failed to flee! The enemy blocks your escape.';
      combat.playerTurn = false;
      Game.render();

      setTimeout(() => {
        this._enemyTurn(combat);
        combat.turn++;
        combat.playerTurn = true;

        if (GameState.run.ship.hull <= 0) {
          this._playerDestroyed();
          return;
        }
        Game.render();
      }, 800);
    }
  },

  surrender() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const lost = Math.floor(GameState.run.credits * 0.5);
    GameState.run.credits -= lost;
    GameState.run.activeCombat = null;
    GameState.run.activeEvent = null;
    GameState.addLog('combat', `Surrendered. Lost ₢${lost}.`);
    GameState.screen = 'map';
    Tabs.activeTab = 'map';
    Game.render();
  },

  _victory(combat) {
    const lootCredits = 10 + Math.floor(Math.random() * 30);
    GameState.run.credits += lootCredits;

    GameState.run.activeCombat = null;
    GameState.run.activeEvent = null;
    GameState.addLog('combat', `Destroyed ${combat.enemy.name}. Looted ₢${lootCredits}.`);

    if (combat.enemy.faction) {
      EconomyEngine.adjustReputation(combat.enemy.faction, -1);
    }

    GameState.screen = 'map';
    Tabs.activeTab = 'map';
    GameState.save();
    Game.render();
  },

  _playerDestroyed() {
    GameState.endRun('ship_destroyed');
    GameState.screen = 'reconstruction';
    ReconstructionUI.start();
  },

  _genericEnemy() {
    return {
      name: 'Hostile Vessel',
      emoji: '🚀',
      hull: 40,
      shields: 0,
      attack: 7,
      defense: 2,
    };
  },
};
