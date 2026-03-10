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

  // Depth scaling multipliers
  _depthScale(depth) {
    if (depth <= 3) return 0.8;
    if (depth <= 6) return 1.0;
    if (depth <= 9) return 1.2;
    return 1.4;
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
      // Clear spawn cell
      cells[pos.y][pos.x] = { terrain: 'empty', blocked: false };

      const eHull = Math.round((template.hull || 40) * scale);
      const eAtk = Math.round((template.attack || 8) * scale);
      entities.push({
        id: 'enemy_' + i,
        type: 'enemy',
        x: pos.x,
        y: pos.y,
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
        patrolDir: 1,  // for patrol AI
      });
    }

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
    };

    GameState.screen = 'combat';
    GameState.addLog('combat', `Engaged ${template.name || 'hostile vessel'}`);
    this._calculateMoveRange();
    Game.render();
  },

  // ─── Player Weapons ─────────────────────────────────────────

  _getPlayerWeapons() {
    const ship = GameState.run.ship;
    const weapons = ship.equippedWeapons;

    if (!weapons || weapons.length === 0) {
      // Fallback: base system weapon
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
      _ref: wpn,  // reference to actual weapon for ammo tracking
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

    // Place obstacles (avoid spawn zones: x<3 for player, x>5 for enemies)
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

    placed = 0;
    attempts = 0;
    while (placed < debrisCount && attempts < 200) {
      const x = Math.floor(Math.random() * this.GRID_W);
      const y = Math.floor(Math.random() * this.GRID_H);
      if (cells[y][x].terrain === 'empty' && x >= 2 && x <= 6) {
        cells[y][x] = { terrain: 'debris', blocked: false };
        placed++;
      }
      attempts++;
    }

    placed = 0;
    attempts = 0;
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

    // Fallback: place remaining at far right
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

    // BFS from entity position
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
    // Bresenham-like check through grid cells
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
      if (other.type === entity.type) continue; // don't target allies
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

  // ─── Player Move Phase ──────────────────────────────────────

  movePlayer(x, y) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_move') return;

    const player = combat.entities.find(e => e.id === 'player');

    // Allow clicking own position to stay
    if (x === player.x && y === player.y) {
      combat.phase = 'player_action';
      combat.moveRange = [];
      combat.lastAction = 'Holding position. Choose an action.';
      Game.render();
      return;
    }

    // Validate move
    const valid = combat.moveRange.some(c => c.x === x && c.y === y);
    if (!valid) return;

    player.x = x;
    player.y = y;

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
      combat.lastAction = 'Repositioned. Choose an action.';
    }

    combat.phase = 'player_action';
    combat.moveRange = [];
    player.defending = false;
    Game.render();
  },

  // ─── Player Action Phase ────────────────────────────────────

  selectWeapon(weaponIdx) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;

    const player = combat.entities.find(e => e.id === 'player');

    if (combat.selectedWeaponIdx === weaponIdx) {
      // Deselect
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

    const player = combat.entities.find(e => e.id === 'player');
    const target = combat.entities.find(e => e.id === targetId);
    if (!target || target.hull <= 0) return;

    const weaponIdx = combat.selectedWeaponIdx;
    const weapon = player.weapons[weaponIdx];
    if (!weapon) return;

    // Verify target is in range
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

    // Calculate damage
    let damage = weapon.damage || 2;

    // Crew bonus from soldier
    const gunner = GameState.run.crew.find(c => !c.dead && c.role === 'soldier');
    if (gunner) damage += 1;

    // Scanned weakness bonus
    if (target.scanned && target.weakness === 'weapons') {
      damage = Math.round(damage * 1.3);
    }

    // Roll variance
    damage = Math.round(damage * (0.7 + Math.random() * 0.6));

    // Shield interaction
    const shieldMode = this.SHIELD_INTERACTION[weapon.type] || 'partial';
    let shieldMsg = '';
    if (target.shields > 0) {
      if (shieldMode === 'blocked') {
        const shieldDmg = Math.min(damage, target.shields);
        target.shields = Math.max(0, target.shields - shieldDmg);
        shieldMsg = ` (${shieldDmg} to shields)`;
        // Consume ammo
        if (weapon._ammo !== null) {
          weapon._ammo--;
          if (weapon._ref) weapon._ref._currentAmmo = weapon._ammo;
        }
        combat.lastAction = `${weapon.name} hits ${target.name}${shieldMsg}`;
        this._finishPlayerAction(combat);
        return;
      } else if (shieldMode === 'partial') {
        damage = Math.max(1, damage - 1);
      }
    }

    const actualDamage = Math.max(1, damage - target.defense);
    target.hull = Math.max(0, target.hull - actualDamage);

    // Consume ammo
    if (weapon._ammo !== null) {
      weapon._ammo--;
      if (weapon._ref) weapon._ref._currentAmmo = weapon._ammo;
    }

    combat.lastAction = `${weapon.name} hits ${target.name} for ${actualDamage}!`;

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

    // Check if target destroyed
    if (target.hull <= 0) {
      combat.lastAction += ` ${target.name} destroyed!`;
    }

    this._finishPlayerAction(combat);
  },

  playerDefend() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;

    const player = combat.entities.find(e => e.id === 'player');
    player.defending = true;
    const shieldLevel = GameState.run.ship.baseSystems.shields_armor.level;
    combat.lastAction = `Shields raised. Damage reduced by ${shieldLevel * 2 + 3}.`;
    this._finishPlayerAction(combat);
  },

  playerRepair() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;

    const player = combat.entities.find(e => e.id === 'player');
    const engineer = GameState.run.crew.find(c => !c.dead && c.role === 'engineer');
    const repair = engineer ? 12 : 6;
    ShipEngine.repair(repair);
    player.hull = GameState.run.ship.hull;
    combat.lastAction = `Emergency repairs: +${repair} hull.`;
    this._finishPlayerAction(combat);
  },

  playerScan(targetId) {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;

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

    if (Math.random() * 100 < successChance) {
      target.scanned = true;
      if (!target.weakness) {
        const weaknesses = ['weapons', 'shields', 'engines'];
        target.weakness = weaknesses[Math.floor(Math.random() * weaknesses.length)];
      }
      combat.lastAction = `Scan: ${target.name} weakness is ${target.weakness}.`;
    } else {
      combat.lastAction = 'Scan inconclusive.';
    }

    this._finishPlayerAction(combat);
  },

  skipAction() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'player_action') return;
    combat.lastAction = 'Action skipped.';
    this._finishPlayerAction(combat);
  },

  _finishPlayerAction(combat) {
    combat.selectedWeaponIdx = null;
    combat.attackRange = [];

    // Check victory before enemy turn
    if (this._checkVictory(combat)) return;

    // Transition to enemy phase
    combat.phase = 'enemy';
    Game.render();

    // Run enemy turns with delay
    setTimeout(() => this._runEnemyTurns(), 600);
  },

  // ─── Yield Handling ─────────────────────────────────────────

  acceptYield() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'yield_offer') return;

    const target = combat.entities.find(e => e.id === combat._yieldingEntity);
    if (target) {
      target.hull = 0; // Remove from combat
      combat.lastAction = `${target.name} disabled and surrendered.`;
    }

    // Check if all enemies dealt with
    const remaining = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0 && !e.yielded);
    if (remaining.length === 0) {
      this._victory('victory_disabled');
      return;
    }

    // Continue combat against remaining enemies
    combat.phase = 'enemy';
    Game.render();
    setTimeout(() => this._runEnemyTurns(), 600);
  },

  rejectYield() {
    const combat = GameState.run.activeCombat;
    if (!combat || combat.phase !== 'yield_offer') return;

    const target = combat.entities.find(e => e.id === combat._yieldingEntity);
    if (target) {
      // Enemy fights desperately: +25% attack
      target.attack = Math.round(target.attack * 1.25);
      target.yielded = false; // reset so they fight on
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

    GameState.run.fuel = Math.max(0, GameState.run.fuel - 1);
    GameState.addLog('combat', 'Fled from combat.');
    this._endCombat('fled');
  },

  // ─── Surrender ──────────────────────────────────────────────

  surrender() {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    const lost = Math.floor(GameState.run.credits * 0.5);
    GameState.run.credits -= lost;
    GameState.addLog('combat', `Surrendered. Lost ₢${lost}.`);
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

    // Check player death
    const player = combat.entities.find(e => e.id === 'player');
    player.hull = GameState.run.ship.hull;

    if (GameState.run.ship.hull <= 0) {
      this._playerDestroyed();
      return;
    }

    // Check mine proximity damage to player
    this._checkMineProximity(combat);
    if (GameState.run.ship.hull <= 0) {
      this._playerDestroyed();
      return;
    }

    // Advance turn
    combat.turn++;
    combat.phase = 'player_move';
    this._calculateMoveRange();
    Game.render();
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
    // Move toward player
    this._aiMoveToward(entity, player, combat);
    // Attack if in range
    return this._aiAttack(entity, player, combat);
  },

  _aiCautious(entity, player, combat) {
    const dist = this._getDistance(entity, player);
    const preferredRange = 3;

    if (dist < 2) {
      // Too close, move away
      this._aiMoveAway(entity, player, combat);
    } else if (dist > preferredRange + 1) {
      // Too far, close in
      this._aiMoveToward(entity, player, combat);
    }
    // else stay at range

    return this._aiAttack(entity, player, combat);
  },

  _aiStationary(entity, player, combat) {
    // Never move, just attack
    return this._aiAttack(entity, player, combat);
  },

  _aiPatrol(entity, player, combat) {
    // Move back and forth along current row
    const nx = entity.x + entity.patrolDir;
    if (nx >= 0 && nx < this.GRID_W && !combat.cells[entity.y][nx].blocked &&
        !this._getEntityAt(nx, entity.y)) {
      entity.x = nx;
    } else {
      entity.patrolDir *= -1;
    }
    // Patrol entities (mines) don't attack conventionally
    return null;
  },

  _aiMoveToward(entity, player, combat) {
    if (entity.moveSpeed <= 0) return;

    const moveable = this._getMoveableCells(entity);
    if (moveable.length === 0) return;

    // Pick cell closest to player
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
      entity.x = best.x;
      entity.y = best.y;
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
      entity.x = best.x;
      entity.y = best.y;
    }
  },

  _aiAttack(entity, player, combat) {
    if (!entity.weapons || entity.weapons.length === 0) return null;
    if (entity.attack <= 0) return null;

    // Pick best weapon that can reach player
    for (const weapon of entity.weapons) {
      const range = weapon.range || this.WEAPON_RANGE[weapon.type] || 2;
      const dist = this._getDistance(entity, player);
      if (dist > range) continue;

      const blocked = this.WEAPON_BLOCKED_BY_OBSTACLES[weapon.type] !== false;
      if (blocked && !this._hasLineOfSight(entity, player, combat.cells)) continue;

      // Calculate damage
      let damage = weapon.damage || entity.attack;
      damage = Math.round(damage * (0.6 + Math.random() * 0.8));

      // Player defending
      if (player.defending) {
        const shieldLevel = GameState.run.ship.baseSystems.shields_armor.level;
        damage = Math.max(1, damage - shieldLevel * 2 - 3);
      }

      // Apply to ship
      const actualDmg = Math.max(1, damage);
      ShipEngine.takeDamage(actualDmg);
      return `${entity.name} fires for ${actualDmg}.`;
    }

    return null;
  },

  _checkMineProximity(combat) {
    // Check if any patrol mines are adjacent to player
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

    // Determine result type
    const anyYielded = combat.entities.some(e => e.type === 'enemy' && e.yielded);
    const result = anyYielded ? 'victory_disabled' : 'victory_destroyed';
    this._victory(result);
    return true;
  },

  _victory(result) {
    const combat = GameState.run.activeCombat;
    if (!combat) return;

    // Loot — disabled ships give more
    const baseLoot = 10 + Math.floor(Math.random() * 30);
    const loot = result === 'victory_disabled' ? Math.round(baseLoot * 1.5) : baseLoot;
    GameState.run.credits += loot;

    // Faction reputation hit for attacking faction ships
    const factionEntity = combat.entities.find(e => e.type === 'enemy' && e.faction);
    if (factionEntity && result === 'victory_destroyed') {
      EconomyEngine.adjustReputation(factionEntity.faction, -1);
    }

    combat.combatResult = result;
    combat.phase = 'victory';
    combat.lastAction = result === 'victory_disabled'
      ? `Enemy disabled. Looted ₢${loot}. The ship is intact — boarding is possible.`
      : `Enemy destroyed. Salvaged ₢${loot} from the wreckage.`;

    GameState.addLog('combat', combat.lastAction);
    Game.render();
  },

  endCombatAndReturn() {
    // Called from UI "Continue" button after victory
    const combat = GameState.run.activeCombat;
    if (!combat) return;
    this._endCombat(combat.combatResult);
  },

  _endCombat(result) {
    const combat = GameState.run.activeCombat;
    const fromEvent = combat ? combat.fromEvent : false;

    // Sync player hull back to ship state
    const player = combat ? combat.entities.find(e => e.id === 'player') : null;
    if (player) {
      // Hull is already synced via ShipEngine.takeDamage/repair
    }

    GameState.run.activeCombat = null;
    GameState.run.lastCombatResult = result;

    if (fromEvent && GameState.run.activeEvent) {
      // Return to event — advance to next step
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
    GameState.run.activeCombat = null;
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
