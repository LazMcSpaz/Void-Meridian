/* Void Meridian — Grid-Based Combat UI */

const CombatUI = {
  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.style.cssText = 'padding:var(--space-sm); overflow-y:auto;';

    const combat = GameState.run.activeCombat;
    if (!combat) {
      screen.innerHTML = '<p style="color:var(--text-muted)">No active combat.</p>';
      container.appendChild(screen);
      return;
    }

    // Hull bars
    this._renderHullBars(screen, combat);

    // Grid
    this._renderGrid(screen, combat);

    // Phase indicator + last action
    this._renderPhaseInfo(screen, combat);

    // Action controls (phase-dependent)
    this._renderActions(screen, combat);

    container.appendChild(screen);
  },

  // ─── Hull Bars ──────────────────────────────────────────────

  _renderHullBars(screen, combat) {
    const player = combat.entities.find(e => e.id === 'player');
    const enemies = combat.entities.filter(e => e.type === 'enemy' && e.hull > 0);

    // Player hull
    const pHull = GameState.run.ship.hull;
    const pMax = GameState.run.ship.maxHull;
    screen.appendChild(this._hullBar('YOUR HULL', pHull, pMax, 'var(--color-hull)'));

    // Enemy hulls
    for (const enemy of enemies) {
      const color = enemy.yielded ? 'var(--color-warning)' : 'var(--color-danger)';
      const label = enemies.length > 1 ? enemy.name : `ENEMY HULL`;
      const suffix = enemy.scanned ? ` [${enemy.weakness}]` : '';
      screen.appendChild(this._hullBar(label + suffix, enemy.hull, enemy.maxHull, color));
    }

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
  },

  _hullBar(label, current, max, color) {
    const pct = max > 0 ? Math.round((current / max) * 100) : 0;
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    const el = document.createElement('div');
    el.style.cssText = 'margin:2px 0; font-size:var(--font-size-sm);';
    el.innerHTML = `<span class="system-label" style="min-width:100px;display:inline-block;">${label}</span> ` +
      `<span style="color:${color}">${'\u2588'.repeat(filled)}</span>` +
      `<span style="color:var(--text-muted)">${'\u2591'.repeat(empty)}</span> ` +
      `<span style="color:var(--text-secondary)">${current}/${max}</span>`;
    return el;
  },

  // ─── Grid ───────────────────────────────────────────────────

  _renderGrid(screen, combat) {
    const grid = document.createElement('div');
    const cellSize = Math.min(48, Math.floor((window.innerWidth - 32) / combat.gridWidth));
    grid.style.cssText = `display:grid; grid-template-columns:repeat(${combat.gridWidth}, ${cellSize}px); ` +
      `gap:1px; margin:var(--space-sm) auto; width:fit-content; background:var(--border);` +
      `border:1px solid var(--border);`;

    const moveSet = new Set(combat.moveRange.map(c => `${c.x},${c.y}`));
    const attackSet = new Set(combat.attackRange.map(c => `${c.x},${c.y}`));

    for (let y = 0; y < combat.gridHeight; y++) {
      for (let x = 0; x < combat.gridWidth; x++) {
        const cell = document.createElement('div');
        cell.style.cssText = `width:${cellSize}px; height:${cellSize}px; display:flex; ` +
          `align-items:center; justify-content:center; font-size:${Math.round(cellSize * 0.55)}px; ` +
          `cursor:pointer; position:relative; transition:var(--transition-fast);`;

        const terrain = combat.cells[y][x].terrain;
        const key = `${x},${y}`;
        const entity = combat.entities.find(e => e.x === x && e.y === y && e.hull > 0);

        // Background
        let bg = 'var(--bg-secondary)';
        if (terrain === 'asteroid') bg = 'var(--bg-tertiary)';
        else if (terrain === 'debris') bg = '#0d1520';
        else if (terrain === 'mine') bg = 'var(--bg-secondary)';

        // Highlight moveable cells
        if (combat.phase === 'player_move' && moveSet.has(key)) {
          bg = 'rgba(92, 207, 230, 0.15)';
          cell.style.outline = '1px solid var(--color-accent)';
          cell.style.outlineOffset = '-1px';
        }

        // Highlight attack range
        if (combat.phase === 'player_action' && attackSet.has(key)) {
          if (entity && entity.type === 'enemy') {
            bg = 'rgba(255, 107, 107, 0.25)';
            cell.style.outline = '2px solid var(--color-danger)';
            cell.style.outlineOffset = '-2px';
          } else {
            bg = 'rgba(255, 107, 107, 0.08)';
          }
        }

        cell.style.background = bg;

        // Mine pulsing border
        if (terrain === 'mine') {
          cell.style.boxShadow = 'inset 0 0 4px var(--color-warning)';
        }

        // Render content
        if (entity) {
          const emoji = document.createElement('span');
          emoji.textContent = entity.emoji;
          if (entity.id === 'player') {
            emoji.style.filter = 'drop-shadow(0 0 3px var(--color-accent))';
          } else if (entity.type === 'enemy') {
            emoji.style.filter = 'drop-shadow(0 0 3px var(--color-danger))';
          }
          cell.appendChild(emoji);

          // Mini hull indicator for enemies
          if (entity.type === 'enemy') {
            const hpDot = document.createElement('div');
            const hpPct = entity.hull / entity.maxHull;
            hpDot.style.cssText = `position:absolute; bottom:1px; left:50%; transform:translateX(-50%); ` +
              `width:${Math.round(cellSize * 0.6)}px; height:2px; ` +
              `background:${hpPct > 0.5 ? 'var(--color-success)' : hpPct > 0.25 ? 'var(--color-warning)' : 'var(--color-danger)'};`;
            cell.appendChild(hpDot);
          }
        } else if (terrain === 'asteroid') {
          cell.textContent = '\u25C6'; // diamond
          cell.style.color = 'var(--text-muted)';
          cell.style.fontSize = `${Math.round(cellSize * 0.4)}px`;
        } else if (terrain === 'debris') {
          cell.textContent = '\u2591'; // light shade
          cell.style.color = 'var(--text-muted)';
        } else if (terrain === 'mine') {
          cell.textContent = '\u26A0'; // warning sign
          cell.style.fontSize = `${Math.round(cellSize * 0.4)}px`;
        }

        // Click handlers
        if (combat.phase === 'player_move') {
          if (moveSet.has(key) || (entity && entity.id === 'player')) {
            cell.addEventListener('click', () => {
              if (entity && entity.id === 'player') {
                CombatEngine.movePlayer(x, y); // stay in place
              } else {
                CombatEngine.movePlayer(x, y);
              }
            });
          }
        } else if (combat.phase === 'player_action' && combat.selectedWeaponIdx !== null) {
          if (entity && entity.type === 'enemy' && attackSet.has(key)) {
            cell.addEventListener('click', () => CombatEngine.fireWeapon(entity.id));
          }
        }

        grid.appendChild(cell);
      }
    }

    screen.appendChild(grid);
  },

  // ─── Phase Info ─────────────────────────────────────────────

  _renderPhaseInfo(screen, combat) {
    const phaseLabel = {
      player_move: 'MOVE PHASE',
      player_action: 'ACTION PHASE',
      enemy: 'ENEMY TURN',
      yield_offer: 'ENEMY YIELDS',
      victory: combat.combatResult === 'victory_disabled' ? 'ENEMY DISABLED' : 'ENEMY DESTROYED',
      defeat: 'DEFEAT',
    };

    const turnDiv = document.createElement('div');
    turnDiv.className = 'system-label';
    turnDiv.style.cssText = 'margin:var(--space-sm) 0;';
    turnDiv.textContent = `TURN ${combat.turn} \u2014 ${phaseLabel[combat.phase] || combat.phase}`;
    screen.appendChild(turnDiv);

    if (combat.lastAction) {
      const actionLog = document.createElement('div');
      actionLog.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); ' +
        'margin-bottom:var(--space-sm); min-height:2em;';
      actionLog.textContent = combat.lastAction;
      screen.appendChild(actionLog);
    }

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
  },

  // ─── Actions ────────────────────────────────────────────────

  _renderActions(screen, combat) {
    const player = combat.entities.find(e => e.id === 'player');

    switch (combat.phase) {
      case 'player_move':
        this._renderMoveActions(screen, player);
        break;
      case 'player_action':
        this._renderCombatActions(screen, combat, player);
        break;
      case 'enemy':
        this._renderWaiting(screen);
        break;
      case 'yield_offer':
        this._renderYieldOffer(screen, combat);
        break;
      case 'victory':
        this._renderVictory(screen, combat);
        break;
    }
  },

  _renderMoveActions(screen, player) {
    const hint = document.createElement('div');
    hint.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin-bottom:var(--space-sm);';
    hint.textContent = 'Tap a highlighted cell to move, or tap your ship to stay.';
    screen.appendChild(hint);

    // Flee button if at edge
    if (CombatEngine._isAtEdge(player)) {
      const fleeBtn = this._actionBtn('\uD83C\uDFC3 FLEE (edge)', 'var(--color-warning)',
        () => CombatEngine.attemptFlee());
      screen.appendChild(fleeBtn);
    }

    // Surrender always available
    const surrenderBtn = this._actionBtn('\uD83C\uDFF3 SURRENDER', 'var(--color-danger)',
      () => CombatEngine.surrender());
    screen.appendChild(surrenderBtn);
  },

  _renderCombatActions(screen, combat, player) {
    const actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:var(--space-xs);';

    // Weapon buttons
    for (let i = 0; i < player.weapons.length; i++) {
      const wpn = player.weapons[i];
      const selected = combat.selectedWeaponIdx === i;
      const hasAmmo = wpn._ammo === null || wpn._ammo > 0;
      const ammoStr = wpn._ammo !== null ? ` (${wpn._ammo})` : '';

      const btn = this._actionBtn(
        `\u2694 ${wpn.name}${ammoStr}`,
        selected ? 'var(--color-accent)' : 'var(--border)',
        () => CombatEngine.selectWeapon(i)
      );
      if (!hasAmmo) {
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
      }
      actionsRow.appendChild(btn);
    }

    screen.appendChild(actionsRow);

    // Utility actions row
    const utilRow = document.createElement('div');
    utilRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:var(--space-xs); margin-top:var(--space-xs);';

    utilRow.appendChild(this._actionBtn('\uD83D\uDEE1 DEFEND', 'var(--border)',
      () => CombatEngine.playerDefend()));
    utilRow.appendChild(this._actionBtn('\uD83D\uDD27 REPAIR', 'var(--border)',
      () => CombatEngine.playerRepair()));

    // Scan button — targets first unscanned enemy
    const unscanned = combat.entities.find(e => e.type === 'enemy' && e.hull > 0 && !e.scanned);
    if (unscanned) {
      utilRow.appendChild(this._actionBtn('\uD83D\uDCE1 SCAN', 'var(--border)',
        () => CombatEngine.playerScan(unscanned.id)));
    }

    utilRow.appendChild(this._actionBtn('\u23ED SKIP', 'var(--text-muted)',
      () => CombatEngine.skipAction()));

    screen.appendChild(utilRow);

    // Weapon info hint
    if (combat.selectedWeaponIdx !== null) {
      const wpn = player.weapons[combat.selectedWeaponIdx];
      const hint = document.createElement('div');
      hint.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:var(--space-xs);';
      hint.textContent = `${wpn.name}: ${wpn.type} \u2022 dmg ${wpn.damage} \u2022 range ${wpn.range} \u2014 tap a target`;
      screen.appendChild(hint);
    }
  },

  _renderWaiting(screen) {
    const waiting = document.createElement('div');
    waiting.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); text-align:center;';
    waiting.textContent = 'Enemy taking action...';
    screen.appendChild(waiting);
  },

  _renderYieldOffer(screen, combat) {
    const target = combat.entities.find(e => e.id === combat._yieldingEntity);
    const name = target ? target.name : 'Enemy';

    const panel = document.createElement('div');
    panel.style.cssText = 'border:1px solid var(--color-warning); padding:var(--space-md); ' +
      'margin:var(--space-sm) 0; background:rgba(255,213,128,0.05);';

    const title = document.createElement('div');
    title.className = 'system-label';
    title.style.color = 'var(--color-warning)';
    title.textContent = `${name.toUpperCase()} SIGNALS SURRENDER`;
    panel.appendChild(title);

    const desc = document.createElement('div');
    desc.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin:var(--space-sm) 0;';
    desc.textContent = 'The enemy vessel is crippled. Their weapons are powering down.';
    panel.appendChild(desc);

    const acceptBtn = this._actionBtn('ACCEPT \u2014 Disable & Board', 'var(--color-success)',
      () => CombatEngine.acceptYield());
    panel.appendChild(acceptBtn);

    const rejectBtn = this._actionBtn('REJECT \u2014 Destroy Them', 'var(--color-danger)',
      () => CombatEngine.rejectYield());
    panel.appendChild(rejectBtn);

    screen.appendChild(panel);
  },

  _renderVictory(screen, combat) {
    const panel = document.createElement('div');
    panel.style.cssText = 'border:1px solid var(--color-success); padding:var(--space-md); ' +
      'margin:var(--space-sm) 0; background:rgba(135,214,141,0.05); text-align:center;';

    const title = document.createElement('div');
    title.className = 'system-label';
    title.style.color = 'var(--color-success)';
    title.textContent = combat.combatResult === 'victory_disabled' ? 'ENEMY DISABLED' : 'ENEMY DESTROYED';
    panel.appendChild(title);

    const continueBtn = this._actionBtn('CONTINUE', 'var(--color-accent)',
      () => CombatEngine.endCombatAndReturn());
    continueBtn.style.marginTop = 'var(--space-md)';
    panel.appendChild(continueBtn);

    screen.appendChild(panel);
  },

  _actionBtn(text, borderColor, onClick) {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.style.cssText = `flex:1; min-width:120px; border-color:${borderColor}; ` +
      'padding:var(--space-sm) var(--space-md); font-size:var(--font-size-sm); margin:2px 0;';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  },
};
