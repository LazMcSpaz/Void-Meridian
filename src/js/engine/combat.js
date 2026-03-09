/* Void Meridian — Combat Engine */

const CombatEngine = {
  startCombat(enemyId) {
    const enemyDef = Registry.getEnemy(enemyId);
    const enemy = enemyDef ? { ...enemyDef } : this._genericEnemy();

    GameState.run.activeCombat = {
      enemy: {
        name: enemy.name || 'Unknown Vessel',
        emoji: enemy.emoji || '🚀',
        hull: enemy.hull || 50,
        maxHull: enemy.hull || 50,
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

    // Check if enemy destroyed
    if (combat.enemy.hull <= 0) {
      this._victory(combat);
      return;
    }

    // Enemy turn
    combat.playerTurn = false;
    Game.render();

    setTimeout(() => {
      this._enemyTurn(combat);
      combat.turn++;
      combat.playerTurn = true;

      // Check if player destroyed
      if (GameState.run.ship.hull <= 0) {
        this._playerDestroyed();
        return;
      }

      Game.render();
    }, 800);
  },

  _playerAttack(combat) {
    const ship = GameState.run.ship;
    const weaponLevel = ship.baseSystems.weapons.level;

    // Crew bonus from soldier
    let crewBonus = 0;
    const gunner = GameState.run.crew.find(c => !c.dead && c.role === 'soldier');
    if (gunner) crewBonus = 2;

    const baseDamage = 5 + weaponLevel * 3 + crewBonus;
    const roll = Math.random();
    const damage = Math.round(baseDamage * (0.7 + roll * 0.6));

    const actualDamage = Math.max(1, damage - combat.enemy.defense);
    combat.enemy.hull = Math.max(0, combat.enemy.hull - actualDamage);
    combat.lastAction = `Weapons fire! ${actualDamage} damage dealt to ${combat.enemy.name}.`;

    // Weakness bonus
    if (combat.enemy.scanned && combat.enemy.weakness === 'weapons') {
      const bonus = Math.round(actualDamage * 0.3);
      combat.enemy.hull = Math.max(0, combat.enemy.hull - bonus);
      combat.lastAction += ` Exploited weakness for ${bonus} extra damage!`;
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
    combat.lastAction = `Evasive maneuver engaged. ${chance}% dodge chance.`;
  },

  _playerRepair(combat) {
    const engineer = GameState.run.crew.find(c => !c.dead && c.role === 'engineer');
    const repair = engineer ? 12 : 6;
    ShipEngine.repair(repair);
    combat.lastAction = `Emergency repairs: +${repair} hull.`;
  },

  _playerScan(combat) {
    if (combat.enemy.scanned) {
      combat.lastAction = 'Enemy already scanned. No new data.';
      return;
    }
    const scientist = GameState.run.crew.find(c => !c.dead && c.role === 'scientist');
    const techie = GameState.run.crew.find(c => !c.dead && c.role === 'technician');
    const successChance = (scientist || techie) ? 80 : 50;

    if (Math.random() * 100 < successChance) {
      combat.enemy.scanned = true;
      const weaknesses = ['weapons', 'shields', 'engines'];
      combat.enemy.weakness = weaknesses[Math.floor(Math.random() * weaknesses.length)];
      combat.lastAction = `Scan complete. Weakness identified: ${combat.enemy.weakness}.`;
    } else {
      combat.lastAction = 'Scan inconclusive. Try again next turn.';
    }
  },

  _enemyTurn(combat) {
    // Check evasion
    if (combat.playerEvading) {
      const pilot = GameState.run.crew.find(c => !c.dead && c.role === 'pilot');
      const dodgeChance = pilot ? 0.6 : 0.35;
      if (Math.random() < dodgeChance) {
        combat.lastAction = 'Enemy fires — you dodge the attack!';
        return;
      }
    }

    const baseDamage = combat.enemy.attack;
    const roll = Math.random();
    let damage = Math.round(baseDamage * (0.6 + roll * 0.8));

    // Defense reduction
    if (combat.playerDefending) {
      const shieldLevel = GameState.run.ship.baseSystems.shields.level;
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

    // Lose credits and cargo
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
    // Calculate loot
    const lootCredits = 10 + Math.floor(Math.random() * 30);
    GameState.run.credits += lootCredits;

    GameState.run.activeCombat = null;
    GameState.run.activeEvent = null;
    GameState.addLog('combat', `Destroyed ${combat.enemy.name}. Looted ₢${lootCredits}.`);

    // Faction rep hit if enemy has a faction
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
      attack: 7,
      defense: 2,
    };
  },
};
