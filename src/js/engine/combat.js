/* Void Meridian — Grid-Based Tactical Combat Engine */

const CombatEngine = {

  GRID_W: 8,
  GRID_H: 6,

  // Weapon type vs shield interaction
  SHIELD_INTERACTION: {
    ballistic:    'partial',   // shields reduce by 1
    energy:       'blocked',   // fully blocked by shields
    missile:      'bypass',    // ignores shields
    emp:          'bypass',    // affects systems, not hull
    nexus_energy: 'bypass',    // ignores shields
  },

  // Weapon range by type (fallback if weapon has no range stat)
  WEAPON_RANGE: {
    ballistic: 3,
    energy: 2,
    missile: 4,
    emp: 2,
    nexus_energy: 3,
  },

  // Whether weapon type is blocked by obstacles (LOS check)
  WEAPON_BLOCKED_BY_OBSTACLES: {
    ballistic: true,
    energy: true,
    missile: false,
    emp: true,
    nexus_energy: false,
  },

  YIELD_THRESHOLD: 0.25,  // 25% hull

  // Base accuracy by weapon type (percentage)
  WEAPON_ACCURACY: {
    ballistic: 75,
    energy: 90,
    missile: 85,
    emp: 80,
    nexus_energy: 95,
  },

  // Depth scaling multipliers
  _depthScale(depth) {
    if (depth <= 3) return 0.8;
    if (depth <= 6) return 1.0;
    if (depth <= 9) return 1.2;
    return 1.4;
  },

  // ─── Action Point Calculation ──────────────────────────────

  _getPlayerAP() {
    let ap = 2; // base actions per turn
    const captain = GameState.run.captain;
    if (captain && captain.stats && captain.stats.command >= 2) ap++;
    return ap;
  },

  // ─── Start Combat ──────────────────────────────────────────

  startCombat(enemyId, fromEvent) {
    const enemyDef = Registry.getEnemy(enemyId);
    const template = enemyDef ? { ...enemyDef } : this._genericEnemy();
    const scale = this._depthScale(GameState.run.depth);

    // Build grid
    const cells = this._buildGrid(template.grid || {});

    // Create player entity
    const ship = GameState.run.ship;
    const pilot = GameState.run.crew.find(c => !c.dead && c.role === 'pilot');
    const playerEntity = {
      id: 'player',
      type: 'player',
      x: 1,
      y: Math.floor(this.GRID_H / 2),
      _prevX: null, _prevY: null,
      hull: ship.hull,
      maxHull: ship.maxHull,
      shields: ship.baseSystems.shields_armor.level * 5,
      maxShields: ship.baseSystems.shields_armor.level * 5,
      defense: ship.baseSystems.shields_armor.level,
      moveSpeed: 1 + Math.floor(ship.baseSystems.propulsion.level / 2) + (pilot ? 1 : 0),
      weapons: this._getPlayerWeapons(),
      emoji: '🚀',
      name: GameState.run.captain.name || 'Your Ship',
      faction: null,
      yields: false,
      yielded: false,
      defending: false,
      scanned: false,
      ai: null,
    };

    // Clear player spawn cell
    cells[playerEntity.y][playerEntity.x] = { terrain: 'empty', blocked: false };

    // Create enemy entities
    const entities = [playerEntity];
    const count = template.count || 1;
    const enemyPositions = this._getEnemySpawnPositions(count, cells);

    for (let i = 0; i < count; i++) {
      const pos = enemyPositions[i];
      cells[pos.y][pos.x] = { terrain: 'empty', blocked: false };

      const eHull = Math.round((template.hull || 40) * scale);
      const eAtk = Math.round((template.attack || 8) * scale);
      entities.push({
        id: 'enemy_' + i,
        type: 'enemy',
        x: pos.x,
        y: pos.y,
        _prevX: null, _prevY: null,
        hull: eHull,
        maxHull: eHull,
        shields: template.shields || 0,
        maxShields: template.shields || 0,
        attack: eAtk,
        defense: template.defense || 2,
        moveSpeed: template.moveSpeed || 1,
        weapons: (template.weapons || []).map(w => ({
          name: w.name,
          type: w.type,
          damage: Math.round((w.damage || 5) * scale),
          range: w.range || this.WEAPON_RANGE[w.type] || 2,
        })),
        emoji: template.emoji || '🚀',
        name: count > 1 ? `${template.name} ${i + 1}` : template.name,
        faction: template.faction || null,
        yields: template.yields || false,
        yielded: false,
        defending: false,
        scanned: false,
        weakness: template.weakness || null,
        ai: template.ai || 'aggressive',
        patrolDir: 1,
      });
    }

    const playerAP = this._getPlayerAP();

    GameState.run.activeCombat = {
      gridWidth: this.GRID_W,
      gridHeight: this.GRID_H,
      cells: cells,
      entities: entities,
      turn: 1,
      phase: 'player_move',
      selectedWeaponIdx: null,
      moveRange: [],
      attackRange: [],
      lastAction: 'Combat engaged. Move your ship.',
      fromEvent: !!fromEvent,
      combatResult: null,
      enemyDef: template,
      actionsRemaining: playerAP,
      maxActions: playerAP,
      hasMoved: false,
      defeatStats: null,
      visualEffects: [],     // [{x, y, type}] transient per-render
      threatCells: [],       // [{x, y}] cells enemies can attack
      enemyIntentions: [],   // [{entityId, action, icon}] per-enemy intent
    };

    GameState.screen = 'combat';
    GameState.addLog('combat', `Engaged ${template.name || 'hostile vessel'}`);
    this._calculateMoveRange();
    this._calculateThreats();
    this._applySensorBonuses();
    Game.render();
  },

  // ─── Player Weapons ─────────────────────────────────────────

  _getPlayerWeapons() {
    const ship = GameState.run.ship;
    const weapons = ship.equippedWeapons;

    if (!weapons || weapons.length === 0) {
      const weaponLevel = ship.baseSystems.weapons.level;
      return [{
        name: 'Ship Guns',
        type: 'ballistic',
        damage: 5 + weaponLevel * 3,
        range: 2,
        _ammo: null,
        _ref: null,
      }];
    }

    return weapons.map(wpn => ({
      name: wpn.name,
      type: wpn.type,
      damage: wpn.stats.damage || 2,
      range: wpn.stats.range || this.WEAPON_RANGE[wpn.type] || 2,
      _ammo: typeof wpn._currentAmmo === 'number' ? wpn._currentAmmo : null,
      _ref: wpn,
    }));
  },

  // ─── Grid Building ──────────────────────────────────────────

  _buildGrid(gridDef) {
    const cells = [];
    for (let y = 0; y < this.GRID_H; y++) {
      cells[y] = [];
      for (let x = 0; x < this.GRID_W; x++) {
        cells[y][x] = { terrain: 'empty', blocked: false };
      }
    }

    const obstacleCount = gridDef.obstacles || 0;
    const mineCount = gridDef.mines || 0;
    const debrisCount = gridDef.debris || 0;

    let placed = 0;
    let attempts = 0;
    while (placed < obstacleCount && attempts < 200) {
      const x = Math.floor(Math.random() * this.GRID_W);
      const y = Math.floor(Math.random() * this.GRID_H);
      if (cells[y][x].terrain === 'empty' && x >= 2 && x <= 6) {
        cells[y][x] = { terrain: 'asteroid', blocked: true };
        placed++;
      }
      attempts++;
    }

    placed = 0; attempts = 0;
    while (placed < debrisCount && attempts < 200) {
      const x = Math.floor(Math.random() * this.GRID_W);
      const y = Math.floor(Math.random() * this.GRID_H);
      if (cells[y][x].terrain === 'empty' && x >= 2 && x <= 6) {
        cells[y][x] = { terrain: 'debris', blocked: false };
        placed++;
      }
      attempts++;
    }

    placed = 0; attempts = 0;
    while (placed < mineCount && attempts < 200) {
      const x = Math.floor(Math.random() * this.GRID_W);
      const y = Math.floor(Math.random() * this.GRID_H);
      if (cells[y][x].terrain === 'empty' && x >= 2 && x <= 5) {
        cells[y][x] = { terrain: 'mine', blocked: false };
        placed++;
      }
      attempts++;
    }

    return cells;
  },

  _getEnemySpawnPositions(count, cells) {
    const positions = [];
    const rightCols = [6, 7, 5];
    let attempts = 0;

    while (positions.length < count && attempts < 100) {
      const x = rightCols[attempts % rightCols.length];
      const y = Math.floor(Math.random() * this.GRID_H);
      if (cells[y][x].terrain === 'empty' && !positions.some(p => p.x === x && p.y === y)) {
        positions.push({ x, y });
      }
      attempts++;
    }

    while (positions.length < count) {
      positions.push({ x: 7, y: positions.length % this.GRID_H });
    }

    return positions;
  },

  // ─── Grid Utilities ─────────────────────────────────────────

  _getDistance(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  },

  _getEntityAt(x, y) {
    const combat = GameState.run.activeCombat;
    if (!combat) return null;
    return combat.entities.find(e => e.x === x && e.y === y && e.hull > 0);
  },

  _getMoveableCells(entity) {
    const combat = GameState.run.activeCombat;
    const cells = [];
    const speed = entity.moveSpeed;

    const visited = new Set();
    const queue = [{ x: entity.x, y: entity.y, dist: 0 }];
    visited.add(`${entity.x},${entity.y}`);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.dist > 0) {
        cells.push({ x: curr.x, y: curr.y });
      }
      if (curr.dist >= speed) continue;

      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
      for (const [dx, dy] of dirs) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;
        const key = `${nx},${ny}`;
        if (nx < 0 || nx >= this.GRID_W || ny < 0 || ny >= this.GRID_H) continue;
        if (visited.has(key)) continue;
        if (combat.cells[ny][nx].blocked) continue;
        if (this._getEntityAt(nx, ny)) continue;
        visited.add(key);
        queue.push({ x: nx, y: ny, dist: curr.dist + 1 });
      }
    }

    return cells;
  },

  _hasLineOfSight(from, to, cells) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) return true;

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const cx = Math.round(from.x + dx * t);
      const cy = Math.round(from.y + dy * t);
      if (cx === to.x && cy === to.y) continue;
      if (cx === from.x && cy === from.y) continue;
      if (cells[cy] && cells[cy][cx] && cells[cy][cx].blocked) return false;
    }
    return true;
  },

  _getWeaponTargets(entity, weaponIdx) {
    const combat = GameState.run.activeCombat;
    const weapon = entity.weapons[weaponIdx];
    if (!weapon) return [];

    const range = weapon.range || this.WEAPON_RANGE[weapon.type] || 2;
    const blockedByObs = this.WEAPON_BLOCKED_BY_OBSTACLES[weapon.type] !== false;
    const targets = [];

    for (const other of combat.entities) {
      if (other.id === entity.id || other.hull <= 0) continue;
      if (other.type === entity.type) continue;
      if (other.yielded) continue;

      const dist = this._getDistance(entity, other);
      if (dist > range) continue;

      if (blockedByObs && !this._hasLineOfSight(entity, other, combat.cells)) continue;

      targets.push(other);
    }

    return targets;
  },

  _getAttackRangeCells(entity, weaponIdx) {
    const combat = GameState.run.activeCombat;
    const weapon = entity.weapons[weaponIdx];
    if (!weapon) return [];

    const range = weapon.range || this.WEAPON_RANGE[weapon.type] || 2;
    const cells = [];

    for (let y = 0; y < this.GRID_H; y++) {
      for (let x = 0; x < this.GRID_W; x++) {
        const dist = Math.abs(entity.x - x) + Math.abs(entity.y - y);
        if (dist > 0 && dist <= range) {
          cells.push({ x, y });
        }
      }
    }
    return cells;
  },

  _isAtEdge(entity) {
    return entity.x === 0 || entity.x === this.GRID_W - 1 ||
           entity.y === 0 || entity.y === this.GRID_H - 1;
  },

  _calculateMoveRange() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    const player = combat.entities.find(e => e.id === 'player');
    combat.moveRange = this._getMoveableCells(player);
  },

  // ─── Entity Movement (with animation tracking) ─────────────

  _moveEntity(entity, newX, newY) {
    entity._prevX = entity.x;
    entity._prevY = entity.y;
    entity.x = newX;
    entity.y = newY;
  },

  _clearAnimState() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    for (const e of combat.entities) {
      e._prevX = null;
      e._prevY = null;
    }
  },

  // ─── Player Move Phase ──────────────────────────────────────

  movePlayer(x, y) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_move') return;

    const player = combat.entities.find(e => e.id === 'player');

    // Stay in place
    if (x === player.x && y === player.y) {
      combat.phase = 'player_action';
      combat.moveRange = [];
      combat.hasMoved = true;
      combat.lastAction = `Holding position. ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} remaining.`;
      Game.render();
      return;
    }

    // Validate move
    const valid = combat.moveRange.some(c => c.x === x && c.y === y);
    if (!valid) return;

    this._moveEntity(player, x, y);

    // Check mine collision
    if (combat.cells[y][x].terrain === 'mine') {
      const mineDmg = 8 + Math.floor(Math.random() * 8);
      ShipEngine.takeDamage(mineDmg);
      player.hull = GameState.run.ship.hull;
      combat.cells[y][x] = { terrain: 'empty', blocked: false };
      combat.lastAction = `Moved into a mine! ${mineDmg} damage taken.`;

      if (GameState.run.ship.hull <= 0) {
        this._playerDestroyed();
        return;
      }
    } else {
      combat.lastAction = `Repositioned. ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} remaining.`;
    }

    combat.phase = 'player_action';
    combat.moveRange = [];
    combat.hasMoved = true;
    player.defending = false;
    Game.render();
  },

  // ─── Player Action Phase ────────────────────────────────────

  selectWeapon(weaponIdx) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;

    const player = combat.entities.find(e => e.id === 'player');

    if (combat.selectedWeaponIdx === weaponIdx) {
      combat.selectedWeaponIdx = null;
      combat.attackRange = [];
      Game.render();
      return;
    }

    combat.selectedWeaponIdx = weaponIdx;
    combat.attackRange = this._getAttackRangeCells(player, weaponIdx);
    Game.render();
  },

  fireWeapon(targetId) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;
    if (combat.selectedWeaponIdx === null) return;
    if (combat.actionsRemaining <= 0) return;

    const player = combat.entities.find(e => e.id === 'player');
    const target = combat.entities.find(e => e.id === targetId);
    if (!target || target.hull <= 0) return;

    const weaponIdx = combat.selectedWeaponIdx;
    const weapon = player.weapons[weaponIdx];
    if (!weapon) return;

    // Verify target in range
    const targets = this._getWeaponTargets(player, weaponIdx);
    if (!targets.some(t => t.id === targetId)) return;

    // Check ammo
    if (weapon._ammo !== null && weapon._ammo <= 0) {
      combat.lastAction = `${weapon.name}: no ammo!`;
      combat.selectedWeaponIdx = null;
      combat.attackRange = [];
      Game.render();
      return;
    }

    // Accuracy check
    var hitChance = this._calcAccuracy(weapon, player, target);
    var hitRoll = Math.random() * 100;
    if (hitRoll >= hitChance) {
      // Miss!
      if (weapon._ammo !== null) {
        weapon._ammo--;
        if (weapon._ref) weapon._ref._currentAmmo = weapon._ammo;
      }
      combat.actionsRemaining--;
      combat.lastAction = `${weapon.name} misses ${target.name}! (${Math.round(hitChance)}% acc) ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} left.`;
      this._addEffect(player.x, player.y, 'attack');
      this._addEffect(target.x, target.y, 'miss');
      this._afterPlayerAction(combat);
      return;
    }

    // Calculate damage
    let damage = weapon.damage || 2;

    const gunner = GameState.run.crew.find(c => !c.dead && c.role === 'soldier');
    if (gunner) {
      damage += 1;
      // Crew synergy: Targeting Computer + soldier grants extra +1 damage
      if (GameState.run.ship.equippedModules.some(m => m.id === 'mod_targeting_computer')) {
        damage += 1;
      }
    }

    // Crew combat stats: sum atk_modifier from all living crew
    const atkBonus = GameState.run.crew
      .filter(c => !c.dead && c.combatStats && c.combatStats.atk_modifier)
      .reduce((sum, c) => sum + c.combatStats.atk_modifier, 0);
    if (atkBonus) damage += atkBonus;

    // Sera passive: +2 damage when hull is below 50%
    if (CrewEngine.hasNamedCrew('sera') && GameState.run.ship.hull < GameState.run.ship.maxHull * 0.5) {
      damage += 2;
    }

    if (target.scanned && target.weakness === 'weapons') {
      damage = Math.round(damage * 1.3);
    }

    damage = Math.round(damage * (0.7 + Math.random() * 0.6));

    // Shield interaction
    const shieldMode = this.SHIELD_INTERACTION[weapon.type] || 'partial';
    if (target.shields > 0) {
      if (shieldMode === 'blocked') {
        const shieldDmg = Math.min(damage, target.shields);
        target.shields = Math.max(0, target.shields - shieldDmg);
        if (weapon._ammo !== null) {
          weapon._ammo--;
          if (weapon._ref) weapon._ref._currentAmmo = weapon._ammo;
        }
        combat.actionsRemaining--;
        combat.lastAction = `${weapon.name} hits ${target.name} (${shieldDmg} to shields). ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} left.`;
        this._addEffect(player.x, player.y, 'attack');
        this._addEffect(target.x, target.y, 'shield');
        this._afterPlayerAction(combat);
        return;
      } else if (shieldMode === 'partial') {
        damage = Math.max(1, damage - 1);
      }
    }

    const actualDamage = Math.max(1, damage - target.defense);
    target.hull = Math.max(0, target.hull - actualDamage);

    if (weapon._ammo !== null) {
      weapon._ammo--;
      if (weapon._ref) weapon._ref._currentAmmo = weapon._ammo;
    }

    combat.actionsRemaining--;
    combat.lastAction = `${weapon.name} hits ${target.name} for ${actualDamage}!`;

    // Visual effects
    this._addEffect(player.x, player.y, 'attack');
    this._addEffect(target.x, target.y, target.hull <= 0 ? 'explode' : 'damage');

    // Check yield
    if (target.yields && !target.yielded && target.hull > 0 &&
        target.hull <= target.maxHull * this.YIELD_THRESHOLD) {
      target.yielded = true;
      combat.phase = 'yield_offer';
      combat.selectedWeaponIdx = null;
      combat.attackRange = [];
      combat._yieldingEntity = target.id;
      combat.lastAction = `${target.name} is crippled and signals surrender.`;
      Game.render();
      return;
    }

    if (target.hull <= 0) {
      combat.lastAction += ` ${target.name} destroyed!`;
    }

    this._afterPlayerAction(combat);
  },

  playerDefend() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;
    if (combat.actionsRemaining <= 0) return;

    const player = combat.entities.find(e => e.id === 'player');
    player.defending = true;
    combat.actionsRemaining--;
    const shieldLevel = GameState.run.ship.baseSystems.shields_armor.level;
    combat.lastAction = `Shields raised. Damage reduced by ${shieldLevel * 2 + 3}. ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} left.`;
    this._addEffect(player.x, player.y, 'shield');
    this._afterPlayerAction(combat);
  },

  playerRepair() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;
    if (combat.actionsRemaining <= 0) return;

    const player = combat.entities.find(e => e.id === 'player');
    const engineer = GameState.run.crew.find(c => !c.dead && c.role === 'engineer');
    const repair = engineer ? 12 : 6;
    ShipEngine.repair(repair);
    player.hull = GameState.run.ship.hull;
    combat.actionsRemaining--;
    combat.lastAction = `Emergency repairs: +${repair} hull. ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} left.`;
    this._addEffect(player.x, player.y, 'heal');
    this._afterPlayerAction(combat);
  },

  playerScan(targetId) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;
    if (combat.actionsRemaining <= 0) return;

    const target = combat.entities.find(e => e.id === targetId);
    if (!target) return;

    if (target.scanned) {
      combat.lastAction = `${target.name} already scanned.`;
      Game.render();
      return;
    }

    const scientist = GameState.run.crew.find(c => !c.dead && c.role === 'scientist');
    const techie = GameState.run.crew.find(c => !c.dead && c.role === 'technician');
    const successChance = (scientist || techie) ? 80 : 50;

    combat.actionsRemaining--;

    // Sensor level boosts scan success
    var sensorLvl = this._getSensorLevel();
    if (sensorLvl >= 3) successChance = Math.min(95, successChance + 15);
    else if (sensorLvl >= 2) successChance = Math.min(90, successChance + 10);

    this._addEffect(target.x, target.y, 'scan');

    if (Math.random() * 100 < successChance) {
      target.scanned = true;
      if (!target.weakness) {
        const weaknesses = ['weapons', 'shields', 'engines'];
        target.weakness = weaknesses[Math.floor(Math.random() * weaknesses.length)];
      }
      combat.lastAction = `Scan: ${target.name} weakness is ${target.weakness}. ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} left.`;
    } else {
      combat.lastAction = `Scan inconclusive. ${combat.actionsRemaining} action${combat.actionsRemaining !== 1 ? 's' : ''} left.`;
    }

    this._afterPlayerAction(combat);
  },

  endTurn() {
    const combat = GameState.run.activeCombat;
    if (!combat || (combat.phase !== 'player_action' && combat.phase !== 'player_move')) return;
    combat.actionsRemaining = 0;
    combat.lastAction = 'Turn ended.';
    this._finishPlayerTurn(combat);
  },

  _afterPlayerAction(combat) {
    combat.selectedWeaponIdx = null;
    combat.attackRange = [];

    // Check victory
    if (this._checkVictory(combat)) return;

    // If actions remain, stay in action phase
    if (combat.actionsRemaining > 0) {
      Game.render();
      return;
    }

    // Out of actions — end turn
    this._finishPlayerTurn(combat);
  },

  _finishPlayerTurn(combat) {
    combat.selectedWeaponIdx = null;
    combat.attackRange = [];

    // Check victory before enemy turn
    if (this._checkVictory(combat)) return;

    // Transition to enemy phase
    combat.phase = 'enemy';
    this._clearAnimState();
    this._clearEffects();
    Game.render();

    setTimeout(() => this._runEnemyTurns(), 600);
  },

  // ─── Yield Handling ─────────────────────────────────────────

  acceptYield() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'yield_offer') return;

    const target = combat.entities.find(e => e.id === combat._yieldingEntity);
    if (target) {
      target.hull = 0;
      combat.lastAction = `${target.name} disabled and surrendered.`;
    }

    const remaining = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0 && !e.yielded);
    if (remaining.length === 0) {
      this._victory('victory_disabled');
      return;
    }

    combat.phase = 'enemy';
    Game.render();
    setTimeout(() => this._runEnemyTurns(), 600);
  },

  rejectYield() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'yield_offer') return;

    const target = combat.entities.find(e => e.id === combat._yieldingEntity);
    if (target) {
      target.attack = Math.round(target.attack * 1.25);
      target.yielded = false;
      combat.lastAction = `Yield rejected. ${target.name} fights with desperation.`;
    }

    combat.phase = 'enemy';
    Game.render();
    setTimeout(() => this._runEnemyTurns(), 600);
  },

  // ─── Flee ───────────────────────────────────────────────────

  attemptFlee() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const player = combat.entities.find(e => e.id === 'player');
    if (!this._isAtEdge(player)) {
      combat.lastAction = 'Must be at grid edge to flee!';
      Game.render();
      return;
    }

    // Flee check: base 70%, +5% per propulsion level, -10% per living enemy
    const propLevel = GameState.run.ship.baseSystems.propulsion.level || 1;
    const enemies = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0 && !e.yielded);
    const fleeChance = Math.min(95, Math.max(20, 70 + propLevel * 5 - enemies.length * 10));
    const roll = Math.random() * 100;

    this._clearEffects();

    if (roll < fleeChance) {
      // Success — but enemy fires a parting shot at 50% damage
      var partingDmg = 0;
      for (var i = 0; i < enemies.length; i++) {
        if (enemies[i].weapons && enemies[i].weapons.length > 0) {
          var wpnDmg = enemies[i].weapons[0].damage || enemies[i].attack || 5;
          partingDmg += Math.round(wpnDmg * 0.5 * (0.6 + Math.random() * 0.4));
        }
      }
      if (partingDmg > 0) {
        ShipEngine.takeDamage(partingDmg);
        player.hull = GameState.run.ship.hull;
        this._addEffect(player.x, player.y, 'damage');
      }

      GameState.run.fuel = Math.max(0, GameState.run.fuel - 1);
      combat.lastAction = `Engines flare — you break free! ${partingDmg > 0 ? 'Parting shots deal ' + partingDmg + ' damage.' : ''}`;
      GameState.addLog('combat', `Fled from combat. ${partingDmg > 0 ? 'Took ' + partingDmg + ' parting damage.' : ''}`);

      // Check if parting shot killed us
      if (GameState.run.ship.hull <= 0) {
        Game.render();
        setTimeout(() => this._playerDestroyed(), 600);
        return;
      }

      Game.render();
      setTimeout(() => this._endCombat('fled'), 800);
    } else {
      // Failure — enemy gets a free full-damage attack
      var freeDmg = 0;
      for (var j = 0; j < enemies.length; j++) {
        if (enemies[j].weapons && enemies[j].weapons.length > 0) {
          var eDmg = enemies[j].weapons[0].damage || enemies[j].attack || 5;
          freeDmg += Math.round(eDmg * (0.6 + Math.random() * 0.8));
          this._addEffect(enemies[j].x, enemies[j].y, 'attack');
        }
      }
      if (freeDmg > 0) {
        ShipEngine.takeDamage(freeDmg);
        player.hull = GameState.run.ship.hull;
        this._addEffect(player.x, player.y, 'damage');
      }

      combat.lastAction = `Escape failed! (${Math.round(fleeChance)}% chance) Enemy fires freely — ${freeDmg} damage!`;

      if (GameState.run.ship.hull <= 0) {
        Game.render();
        setTimeout(() => this._playerDestroyed(), 600);
        return;
      }

      // Stay in combat, consume the action
      combat.actionsRemaining = Math.max(0, combat.actionsRemaining - 1);
      this._afterPlayerAction(combat);
    }
  },

  // ─── Surrender ──────────────────────────────────────────────

  surrender() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    // Show confirmation panel first
    combat.phase = 'surrender_confirm';
    combat.lastAction = 'Confirm surrender? The enemy will fire a parting shot.';
    Game.render();
  },

  confirmSurrender() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const player = combat.entities.find(e => e.id === 'player');
    this._clearEffects();

    // Lose 50% credits
    const lost = Math.floor(GameState.run.credits * 0.5);
    GameState.run.credits -= lost;

    // Enemy fires a parting shot (15% of max hull)
    const partingDmg = Math.round(GameState.run.ship.maxHull * 0.15);
    ShipEngine.takeDamage(partingDmg);
    if (player) player.hull = GameState.run.ship.hull;
    this._addEffect(player.x, player.y, 'damage');

    // Reputation penalty with enemy faction
    const factionEntity = combat.entities.find(e => e.type === 'enemy' && e.faction);
    if (factionEntity) {
      EconomyEngine.adjustReputation(factionEntity.faction, -1);
    }

    // Show surrender outcome
    combat.phase = 'surrender_outcome';
    combat.surrenderStats = {
      creditsLost: lost,
      hullDamage: partingDmg,
      faction: factionEntity ? EconomyEngine.getFactionDisplayName(factionEntity.faction) : null,
    };
    combat.lastAction = `Surrendered. Lost ₢${lost}. Parting shot dealt ${partingDmg} hull damage.`;
    GameState.addLog('combat', combat.lastAction);

    // Check if parting shot killed us
    if (GameState.run.ship.hull <= 0) {
      Game.render();
      setTimeout(() => this._playerDestroyed(), 600);
      return;
    }

    Game.render();
  },

  cancelSurrender() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    // Return to whichever phase makes sense
    combat.phase = combat.hasMoved ? 'player_action' : 'player_move';
    combat.lastAction = 'Surrender cancelled.';
    Game.render();
  },

  confirmSurrenderReturn() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    this._endCombat('surrendered');
  },

  // ─── Enemy Turn ─────────────────────────────────────────────

  _runEnemyTurns() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const enemies = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0 && !e.yielded);
    const actions = [];

    for (const enemy of enemies) {
      const action = this._enemyAI(enemy, combat);
      if (action) actions.push(action);
    }

    combat.lastAction = actions.join(' ') || 'Enemies hold position.';

    // Sync player hull
    const player = combat.entities.find(e => e.id === 'player');
    player.hull = GameState.run.ship.hull;

    if (GameState.run.ship.hull <= 0) {
      this._playerDestroyed();
      return;
    }

    this._checkMineProximity(combat);
    if (GameState.run.ship.hull <= 0) {
      this._playerDestroyed();
      return;
    }

    // Advance turn — reset player AP
    combat.turn++;
    combat.phase = 'player_move';
    combat.actionsRemaining = this._getPlayerAP();
    combat.hasMoved = false;
    const player2 = combat.entities.find(e => e.id === 'player');
    if (player2) player2.defending = false;
    this._calculateMoveRange();
    this._calculateThreats();
    Game.render();

    // Clear animation state after render so next frame won't re-animate
    setTimeout(() => {
      this._clearAnimState();
      this._clearEffects();
    }, 500);
  },

  _enemyAI(entity, combat) {
    const player = combat.entities.find(e => e.id === 'player');
    if (!player || player.hull <= 0) return null;

    switch (entity.ai) {
      case 'aggressive':
        return this._aiAggressive(entity, player, combat);
      case 'cautious':
        return this._aiCautious(entity, player, combat);
      case 'stationary':
        return this._aiStationary(entity, player, combat);
      case 'patrol':
        return this._aiPatrol(entity, player, combat);
      default:
        return this._aiAggressive(entity, player, combat);
    }
  },

  _aiAggressive(entity, player, combat) {
    this._aiMoveToward(entity, player, combat);
    return this._aiAttack(entity, player, combat);
  },

  _aiCautious(entity, player, combat) {
    const dist = this._getDistance(entity, player);

    if (dist < 2) {
      this._aiMoveAway(entity, player, combat);
    } else if (dist > 4) {
      this._aiMoveToward(entity, player, combat);
    }

    return this._aiAttack(entity, player, combat);
  },

  _aiStationary(entity, player, combat) {
    return this._aiAttack(entity, player, combat);
  },

  _aiPatrol(entity, player, combat) {
    const nx = entity.x + entity.patrolDir;
    if (nx >= 0 && nx < this.GRID_W && !combat.cells[entity.y][nx].blocked &&
        !this._getEntityAt(nx, entity.y)) {
      this._moveEntity(entity, nx, entity.y);
    } else {
      entity.patrolDir *= -1;
    }
    return null;
  },

  _aiMoveToward(entity, player, combat) {
    if (entity.moveSpeed <= 0) return;

    const moveable = this._getMoveableCells(entity);
    if (moveable.length === 0) return;

    let best = null;
    let bestDist = Infinity;
    for (const cell of moveable) {
      const dist = this._getDistance(cell, player);
      if (dist < bestDist) {
        bestDist = dist;
        best = cell;
      }
    }

    if (best && bestDist < this._getDistance(entity, player)) {
      this._moveEntity(entity, best.x, best.y);
    }
  },

  _aiMoveAway(entity, player, combat) {
    if (entity.moveSpeed <= 0) return;

    const moveable = this._getMoveableCells(entity);
    if (moveable.length === 0) return;

    let best = null;
    let bestDist = 0;
    for (const cell of moveable) {
      const dist = this._getDistance(cell, player);
      if (dist > bestDist) {
        bestDist = dist;
        best = cell;
      }
    }

    if (best) {
      this._moveEntity(entity, best.x, best.y);
    }
  },

  _aiAttack(entity, player, combat) {
    if (!entity.weapons || entity.weapons.length === 0) return null;
    if (entity.attack <= 0) return null;

    for (const weapon of entity.weapons) {
      const range = weapon.range || this.WEAPON_RANGE[weapon.type] || 2;
      const dist = this._getDistance(entity, player);
      if (dist > range) continue;

      const blocked = this.WEAPON_BLOCKED_BY_OBSTACLES[weapon.type] !== false;
      if (blocked && !this._hasLineOfSight(entity, player, combat.cells)) continue;

      // Accuracy check for enemies
      var enemyAcc = this._calcAccuracy(weapon, entity, player);
      if (Math.random() * 100 >= enemyAcc) {
        this._addEffect(entity.x, entity.y, 'attack');
        this._addEffect(player.x, player.y, 'miss');
        return `${entity.name} fires and misses!`;
      }

      let damage = weapon.damage || entity.attack;
      damage = Math.round(damage * (0.6 + Math.random() * 0.8));

      if (player.defending) {
        const shieldLevel = GameState.run.ship.baseSystems.shields_armor.level;
        damage = Math.max(1, damage - shieldLevel * 2 - 3);
      }

      // Crew combat stats: sum def_modifier from all living crew
      const defBonus = GameState.run.crew
        .filter(c => !c.dead && c.combatStats && c.combatStats.def_modifier)
        .reduce((sum, c) => sum + c.combatStats.def_modifier, 0);
      if (defBonus) damage = Math.max(1, damage - defBonus);

      const actualDmg = Math.max(1, damage);
      ShipEngine.takeDamage(actualDmg);
      this._addEffect(entity.x, entity.y, 'attack');
      this._addEffect(player.x, player.y, player.defending ? 'shield' : 'damage');
      return `${entity.name} fires for ${actualDmg}.`;
    }

    return null;
  },

  _checkMineProximity(combat) {
    const player = combat.entities.find(e => e.id === 'player');
    const mines = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0 && e.ai === 'patrol');

    for (const mine of mines) {
      if (this._getDistance(player, mine) <= 1) {
        const dmg = 12 + Math.floor(Math.random() * 8);
        ShipEngine.takeDamage(dmg);
        player.hull = GameState.run.ship.hull;
        mine.hull = 0;
        combat.lastAction += ` Mine detonates for ${dmg}!`;
      }
    }
  },

  // ─── Victory / Defeat ───────────────────────────────────────

  _checkVictory(combat) {
    const enemies = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0 && !e.yielded);
    if (enemies.length > 0) return false;

    const anyYielded = combat.entities.some(e => e.type === 'enemy' && e.yielded);
    const result = anyYielded ? 'victory_disabled' : 'victory_destroyed';
    this._victory(result);
    return true;
  },

  _victory(result) {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const baseLoot = 10 + Math.floor(Math.random() * 30);
    const loot = result === 'victory_disabled' ? Math.round(baseLoot * 1.5) : baseLoot;
    GameState.run.credits += loot;
    combat._victoryLoot = loot;

    const factionEntity = combat.entities.find(e => e.type === 'enemy' && e.faction);
    if (factionEntity && result === 'victory_destroyed') {
      EconomyEngine.adjustReputation(factionEntity.faction, -1);
    }

    combat.combatResult = result;

    if (result === 'victory_disabled') {
      // Go to boarding phase instead of victory
      combat.phase = 'boarding';
      combat.lastAction = `Enemy disabled. Looted ₢${loot}. The ship is intact — choose a boarding action.`;
      GameState.addLog('combat', `Enemy disabled. Looted ₢${loot}.`);
    } else {
      combat.phase = 'victory';
      combat.lastAction = `Enemy destroyed. Salvaged ₢${loot} from the wreckage.`;
      GameState.addLog('combat', combat.lastAction);
    }

    Game.render();
  },

  endCombatAndReturn() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    this._endCombat(combat.combatResult);
  },

  _endCombat(result) {
    const combat = GameState.run.activeCombat;
    const fromEvent = combat ? combat.fromEvent : false;

    GameState.run.activeCombat = null;
    GameState.run.lastCombatResult = result;

    if (fromEvent && GameState.run.activeEvent) {
      GameState.screen = 'map';
      Tabs.activeTab = 'event';
      EventEngine.advanceEvent();
    } else {
      GameState.run.activeEvent = null;
      GameState.screen = 'map';
      Tabs.activeTab = 'map';
    }

    GameState.save();
    Game.render();
  },

  _playerDestroyed() {
    const combat = GameState.run.activeCombat;

    // Collect defeat stats for the defeat screen
    const stats = {
      enemyName: combat ? combat.enemyDef.name : 'Unknown',
      turnsLasted: combat ? combat.turn : 0,
      enemiesDestroyed: combat
        ? combat.entities.filter(e => e.type === 'enemy' && e.hull <= 0).length : 0,
      totalEnemies: combat
        ? combat.entities.filter(e => e.type === 'enemy').length : 0,
    };

    if (combat) {
      combat.phase = 'defeat';
      combat.defeatStats = stats;
      combat.lastAction = 'Your ship has been destroyed.';
      Game.render();
    } else {
      // Fallback: go straight to game over
      GameState.run.activeCombat = null;
      GameState.endRun('ship_destroyed');
      GameState.screen = 'gameOver';
      GameState.save();
      Game.render();
    }
  },

  confirmDefeat() {
    // Called from UI after viewing defeat screen
    GameState.run.activeCombat = null;
    GameState.endRun('ship_destroyed');
    GameState.screen = 'gameOver';
    GameState.save();
    Game.render();
  },

  // ─── Accuracy Calculation ───────────────────────────────────

  _calcAccuracy(weapon, shooter, target) {
    var baseAcc = this.WEAPON_ACCURACY[weapon.type] || 80;
    var dist = this._getDistance(shooter, target);
    var optimalRange = Math.ceil((weapon.range || this.WEAPON_RANGE[weapon.type] || 2) / 2);

    // Distance penalty: -5% per tile away from optimal range
    var distPenalty = Math.abs(dist - optimalRange) * 5;
    var acc = baseAcc - distPenalty;

    // Scanned bonus: +10% against scanned targets
    if (target.scanned) acc += 10;

    // Sensor level bonus (player only): +3% per sensor level above 1
    if (shooter.id === 'player') {
      var sensorLvl = this._getSensorLevel();
      acc += (sensorLvl - 1) * 3;
    }

    // Oss passive: +1 evasion — enemies have -8% accuracy against player
    if (target.id === 'player' && CrewEngine.hasNamedCrew('oss')) {
      acc -= 8;
    }

    return Math.max(30, Math.min(98, acc));
  },

  // ─── Boarding Mechanic ────────────────────────────────────

  selectBoardingAction(actionType) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'boarding') return;

    const crew = GameState.run.crew.filter(c => !c.dead);
    var result = { success: false, rewards: [] };

    switch (actionType) {
      case 'loot': {
        // Always succeeds — guaranteed credits + cargo
        var bonusCredits = 15 + Math.floor(Math.random() * 25);
        GameState.run.credits += bonusCredits;
        result.success = true;
        result.rewards.push('₢' + bonusCredits);

        // Add a cargo item
        var cargoItems = ['salvaged_data_core', 'hull_plating', 'fuel_cells', 'trade_goods', 'medical_supplies', 'encrypted_manifest'];
        var cargoItem = cargoItems[Math.floor(Math.random() * cargoItems.length)];
        var capacity = this._getCargoCapacity();
        if (GameState.run.ship.cargo.length < capacity) {
          GameState.run.ship.cargo.push(cargoItem);
          result.rewards.push(cargoItem.replace(/_/g, ' '));
        } else {
          result.rewards.push('cargo full');
        }
        GameState.addLog('combat', 'Boarded and looted: ₢' + bonusCredits + ', ' + cargoItem.replace(/_/g, ' '));
        break;
      }
      case 'salvage': {
        // Skill check — technician/engineer gives 70%, otherwise 40%
        var hasTech = crew.some(c => c.role === 'technician' || c.role === 'engineer');
        var salvageChance = hasTech ? 70 : 40;

        if (Math.random() * 100 < salvageChance) {
          // Pick a random module from registry
          var modules = ['mod_hull_patch', 'mod_scanner_array', 'mod_reinforced_bulkhead', 'mod_fuel_recycler', 'mod_targeting_computer', 'mod_med_bay'];
          var modId = modules[Math.floor(Math.random() * modules.length)];
          ShipEngine.addModule(modId);
          var mod = Registry.getModule(modId);
          result.success = true;
          result.rewards.push(mod ? mod.name : modId);
          GameState.addLog('combat', 'Salvaged module: ' + (mod ? mod.name : modId));
        } else {
          result.success = false;
          result.rewards.push('nothing usable found');
          GameState.addLog('combat', 'Salvage attempt failed — nothing usable.');
        }
        break;
      }
      case 'intel': {
        // Skill check — scientist gives 75%, otherwise 35%
        var hasSci = crew.some(c => c.role === 'scientist');
        var intelChance = hasSci ? 75 : 35;

        if (Math.random() * 100 < intelChance) {
          // Add a lore fragment
          var fragId = 'boarding_intel_' + Date.now();
          var fragDesc = this._getIntelDescription(combat);
          if (!GameState.run.loreFragments.some(lf => lf.id === fragId)) {
            GameState.run.loreFragments.push({ id: fragId, description: fragDesc, depth: GameState.run.depth });
          }

          // Reveal nearby map nodes
          this._revealNearbyNodes(2);

          result.success = true;
          result.rewards.push('intel acquired', 'nearby nodes revealed');
          GameState.addLog('discovery', fragDesc);
        } else {
          result.success = false;
          result.rewards.push('data corrupted');
          GameState.addLog('combat', 'Intel extraction failed — data corrupted.');
        }
        break;
      }
    }

    combat.phase = 'boarding_result';
    combat.boardingResult = result;
    combat.lastAction = result.success
      ? 'Boarding ' + (result.success ? 'successful' : 'failed') + ': ' + result.rewards.join(', ')
      : 'Boarding yielded: ' + result.rewards.join(', ');
    Game.render();
  },

  _getCargoCapacity() {
    var cargoLevel = GameState.run.ship.baseSystems.cargo_hold.level || 1;
    return cargoLevel * 3;
  },

  _getIntelDescription(combat) {
    var descs = [
      'Intercepted comm logs reveal patrol routes through the sector.',
      'Navigation data extracted — nearby hazards charted.',
      'Faction supply manifests recovered from the ship\'s computers.',
      'Encrypted transmissions decoded — enemy fleet movements logged.',
      'Crew manifest and mission parameters recovered from the wreck.',
    ];
    return descs[Math.floor(Math.random() * descs.length)];
  },

  _revealNearbyNodes(count) {
    var map = GameState.run.map;
    if (!map || !map.nodes) return;
    var currentId = GameState.run.currentNodeId;
    var currentNode = map.nodes.find(n => n.id === currentId);
    if (!currentNode) return;

    // Reveal connected nodes' types
    var revealed = 0;
    for (var i = 0; i < (currentNode.connections || []).length && revealed < count; i++) {
      var connId = currentNode.connections[i];
      var connNode = map.nodes.find(n => n.id === connId);
      if (connNode && !connNode._revealed) {
        connNode._revealed = true;
        revealed++;
      }
    }
  },

  finishBoarding() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    this._endCombat(combat.combatResult);
  },

  // ─── Visual Effects ─────────────────────────────────────────

  _addEffect(x, y, type) {
    const combat = GameState.run.activeCombat;
    if (combat) combat.visualEffects.push({ x: x, y: y, type: type });
  },

  _clearEffects() {
    const combat = GameState.run.activeCombat;
    if (combat) combat.visualEffects = [];
  },

  // ─── Sensor-Based Intelligence ────────────────────────────

  _getSensorLevel() {
    const sensors = GameState.run.ship.baseSystems.sensors;
    if (!sensors || sensors.damaged) return 0;
    return sensors.level || 1;
  },

  _applySensorBonuses() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    const sensorLvl = this._getSensorLevel();

    // Level 4+: auto-scan the first unscanned enemy at combat start
    if (sensorLvl >= 4) {
      var enemies = combat.entities.filter(function(e) { return e.type === 'enemy' && e.hull > 0 && !e.scanned; });
      for (var i = 0; i < enemies.length; i++) {
        enemies[i].scanned = true;
        if (!enemies[i].weakness) {
          var weaknesses = ['weapons', 'shields', 'engines'];
          enemies[i].weakness = weaknesses[Math.floor(Math.random() * weaknesses.length)];
        }
      }
      if (enemies.length > 0) {
        combat.lastAction += ' Advanced sensors reveal enemy weaknesses.';
      }
    }
  },

  // ─── Threat / Intention Calculation ───────────────────────

  _calculateThreats() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const sensorLvl = this._getSensorLevel();
    combat.threatCells = [];
    combat.enemyIntentions = [];

    // Need sensor level 2+ for threat display
    if (sensorLvl < 2) return;

    const player = combat.entities.find(function(e) { return e.id === 'player'; });
    if (!player) return;

    const enemies = combat.entities.filter(function(e) {
      return e.type === 'enemy' && e.hull > 0 && !e.yielded;
    });

    var threatSet = new Set();

    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];

      // Predict where enemy would move
      var predictedX = enemy.x;
      var predictedY = enemy.y;

      if (enemy.ai === 'aggressive' && enemy.moveSpeed > 0) {
        var moveable = this._getMoveableCells(enemy);
        var best = null;
        var bestDist = Infinity;
        for (var m = 0; m < moveable.length; m++) {
          var d = this._getDistance(moveable[m], player);
          if (d < bestDist) { bestDist = d; best = moveable[m]; }
        }
        if (best && bestDist < this._getDistance(enemy, player)) {
          predictedX = best.x;
          predictedY = best.y;
        }
      } else if (enemy.ai === 'cautious' && enemy.moveSpeed > 0) {
        var dist = this._getDistance(enemy, player);
        if (dist < 2) {
          var moveAway = this._getMoveableCells(enemy);
          var bestA = null;
          var bestDistA = 0;
          for (var ma = 0; ma < moveAway.length; ma++) {
            var da = this._getDistance(moveAway[ma], player);
            if (da > bestDistA) { bestDistA = da; bestA = moveAway[ma]; }
          }
          if (bestA) { predictedX = bestA.x; predictedY = bestA.y; }
        }
      }

      // Calculate attack range from predicted position
      var intent = { entityId: enemy.id, action: 'idle', icon: '\u2022' };

      for (var w = 0; w < (enemy.weapons || []).length; w++) {
        var wpn = enemy.weapons[w];
        var range = wpn.range || this.WEAPON_RANGE[wpn.type] || 2;

        // Mark all cells in weapon range as threatened
        for (var ty = 0; ty < this.GRID_H; ty++) {
          for (var tx = 0; tx < this.GRID_W; tx++) {
            var tdist = Math.abs(predictedX - tx) + Math.abs(predictedY - ty);
            if (tdist > 0 && tdist <= range) {
              threatSet.add(tx + ',' + ty);
            }
          }
        }
      }

      // Determine intention display
      var distToPlayer = this._getDistance({ x: predictedX, y: predictedY }, player);
      var hasWeaponInRange = false;
      for (var w2 = 0; w2 < (enemy.weapons || []).length; w2++) {
        var r = enemy.weapons[w2].range || this.WEAPON_RANGE[enemy.weapons[w2].type] || 2;
        if (distToPlayer <= r) { hasWeaponInRange = true; break; }
      }

      if (enemy.ai === 'stationary') {
        intent.action = hasWeaponInRange ? 'attack' : 'idle';
        intent.icon = hasWeaponInRange ? '\u2620' : '\u2022'; // skull or dot
      } else if (hasWeaponInRange) {
        intent.action = 'attack';
        intent.icon = '\u2620'; // skull - will attack
      } else if (enemy.ai === 'aggressive') {
        intent.action = 'advance';
        intent.icon = '\u2192'; // arrow - advancing
      } else if (enemy.ai === 'cautious') {
        intent.action = distToPlayer < 2 ? 'retreat' : 'hold';
        intent.icon = distToPlayer < 2 ? '\u2190' : '\u2022'; // retreat arrow or dot
      } else if (enemy.ai === 'patrol') {
        intent.action = 'patrol';
        intent.icon = '\u21C4'; // left-right arrow
      }

      // Sensor level 3+: show specific intentions
      if (sensorLvl >= 3) {
        combat.enemyIntentions.push(intent);
      }
    }

    // Convert threat set to array
    threatSet.forEach(function(key) {
      var parts = key.split(',');
      combat.threatCells.push({ x: parseInt(parts[0]), y: parseInt(parts[1]) });
    });
  },

  _genericEnemy() {
    return {
      name: 'Hostile Vessel',
      emoji: '🚀',
      hull: 40,
      shields: 0,
      attack: 7,
      defense: 2,
      moveSpeed: 1,
      yields: false,
      ai: 'aggressive',
      count: 1,
      weapons: [
        { name: 'Makeshift Cannon', type: 'ballistic', damage: 7, range: 2 }
      ],
      grid: { obstacles: 3, mines: 0, debris: 1 },
    };
  },
};
