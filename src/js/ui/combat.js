/* Void Meridian — Grid-Based Combat UI */

const CombatUI = {
  render(container) {
    var screen = document.createElement('div');
    screen.className = 'screen';
    screen.style.cssText = 'padding:var(--space-sm); overflow-y:auto;';

    var combat = GameState.run.activeCombat;
    if (!combat) {
      screen.innerHTML = '<p style="color:var(--text-muted)">No active combat.</p>';
      container.appendChild(screen);
      return;
    }

    // Defeat screen is a special full-screen layout
    if (combat.phase === 'defeat') {
      this._renderDefeatScreen(screen, combat);
      container.appendChild(screen);
      return;
    }

    // Hull bars (with sensor-enhanced info)
    this._renderHullBars(screen, combat);

    // Grid
    this._renderGrid(screen, combat);

    // Phase indicator + last action + AP counter
    this._renderPhaseInfo(screen, combat);

    // Action controls (phase-dependent)
    this._renderActions(screen, combat);

    container.appendChild(screen);
  },

  // ─── Hull Bars ──────────────────────────────────────────────

  _renderHullBars(screen, combat) {
    var player = combat.entities.find(function(e) { return e.id === 'player'; });
    var enemies = combat.entities.filter(function(e) { return e.type === 'enemy' && e.hull > 0; });
    var sensorLvl = CombatEngine._getSensorLevel();

    // Player hull
    var pHull = GameState.run.ship.hull;
    var pMax = GameState.run.ship.maxHull;
    screen.appendChild(this._hullBar('YOUR HULL', pHull, pMax, 'var(--color-hull)', null));

    // Enemy hulls
    for (var i = 0; i < enemies.length; i++) {
      var enemy = enemies[i];
      var color = enemy.yielded ? 'var(--color-warning)' : 'var(--color-danger)';
      var label = enemies.length > 1 ? enemy.name : 'ENEMY HULL';
      var suffix = enemy.scanned ? ' [' + enemy.weakness + ']' : '';

      // Sensor-enhanced info
      var intel = null;
      if (sensorLvl >= 2) {
        intel = this._getEnemyIntel(enemy, sensorLvl, combat);
      }

      screen.appendChild(this._hullBar(label + suffix, enemy.hull, enemy.maxHull, color, intel));
    }

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
  },

  _getEnemyIntel(enemy, sensorLvl, combat) {
    var parts = [];

    // Level 2+: show weapon names and ranges
    if (sensorLvl >= 2 && enemy.weapons && enemy.weapons.length > 0) {
      var wpnStrs = [];
      for (var i = 0; i < enemy.weapons.length; i++) {
        var w = enemy.weapons[i];
        wpnStrs.push(w.name + ' (r' + w.range + ')');
      }
      parts.push(wpnStrs.join(', '));
    }

    // Level 3+: show AI behavior and intention
    if (sensorLvl >= 3) {
      var intention = null;
      for (var j = 0; j < (combat.enemyIntentions || []).length; j++) {
        if (combat.enemyIntentions[j].entityId === enemy.id) {
          intention = combat.enemyIntentions[j];
          break;
        }
      }
      if (intention) {
        var intentLabels = {
          attack: '\u2620 WILL ATTACK',
          advance: '\u2192 ADVANCING',
          retreat: '\u2190 RETREATING',
          hold: '\u2022 HOLDING',
          patrol: '\u21C4 PATROLLING',
          idle: '\u2022 IDLE',
        };
        parts.push(intentLabels[intention.action] || intention.action);
      }
    }

    // Level 4+: show defense stat
    if (sensorLvl >= 4) {
      parts.push('DEF ' + enemy.defense);
      if (enemy.shields > 0) parts.push('SH ' + enemy.shields);
    }

    return parts.length > 0 ? parts.join(' \u2022 ') : null;
  },

  _hullBar(label, current, max, color, intel) {
    var pct = max > 0 ? Math.round((current / max) * 100) : 0;
    var filled = Math.round(pct / 10);
    var empty = 10 - filled;
    var el = document.createElement('div');
    el.style.cssText = 'margin:2px 0; font-size:var(--font-size-sm);';
    el.innerHTML = '<span class="system-label" style="min-width:100px;display:inline-block;">' + label + '</span> ' +
      '<span style="color:' + color + '">' + '\u2588'.repeat(filled) + '</span>' +
      '<span style="color:var(--text-muted)">' + '\u2591'.repeat(empty) + '</span> ' +
      '<span style="color:var(--text-secondary)">' + current + '/' + max + '</span>';

    // Sensor intel line
    if (intel) {
      var intelDiv = document.createElement('div');
      intelDiv.style.cssText = 'margin-left:100px; font-size:var(--font-size-sm); color:var(--color-nexus); opacity:0.8;';
      intelDiv.textContent = intel;
      el.appendChild(intelDiv);
    }

    return el;
  },

  // ─── Grid ───────────────────────────────────────────────────

  _renderGrid(screen, combat) {
    var grid = document.createElement('div');
    var cellSize = Math.min(48, Math.floor((window.innerWidth - 32) / combat.gridWidth));
    grid.style.cssText = 'display:grid; grid-template-columns:repeat(' + combat.gridWidth + ', ' + cellSize + 'px); ' +
      'gap:1px; margin:var(--space-sm) auto; width:fit-content; background:var(--border);' +
      'border:1px solid var(--border); position:relative;';

    var moveSet = new Set(combat.moveRange.map(function(c) { return c.x + ',' + c.y; }));
    var attackSet = new Set(combat.attackRange.map(function(c) { return c.x + ',' + c.y; }));
    var threatSet = new Set((combat.threatCells || []).map(function(c) { return c.x + ',' + c.y; }));
    var effectMap = {};
    for (var ei = 0; ei < (combat.visualEffects || []).length; ei++) {
      var eff = combat.visualEffects[ei];
      effectMap[eff.x + ',' + eff.y] = eff.type;
    }

    // Build intention map for icons on enemy cells
    var intentionMap = {};
    for (var ii = 0; ii < (combat.enemyIntentions || []).length; ii++) {
      intentionMap[combat.enemyIntentions[ii].entityId] = combat.enemyIntentions[ii];
    }

    for (var y = 0; y < combat.gridHeight; y++) {
      for (var x = 0; x < combat.gridWidth; x++) {
        var cell = document.createElement('div');
        cell.style.cssText = 'width:' + cellSize + 'px; height:' + cellSize + 'px; display:flex; ' +
          'align-items:center; justify-content:center; font-size:' + Math.round(cellSize * 0.55) + 'px; ' +
          'cursor:pointer; position:relative;';

        var terrain = combat.cells[y][x].terrain;
        var key = x + ',' + y;
        var entity = combat.entities.find(function(e) { return e.x === x && e.y === y && e.hull > 0; });

        // Background
        var bg = 'var(--bg-secondary)';
        if (terrain === 'asteroid') bg = 'var(--bg-tertiary)';
        else if (terrain === 'debris') bg = '#0d1520';
        else if (terrain === 'mine') bg = 'var(--bg-secondary)';

        // Threat highlighting (sensor level 2+, shown during player phases)
        var isPlayerPhase = combat.phase === 'player_move' || combat.phase === 'player_action';
        if (isPlayerPhase && threatSet.has(key) && !moveSet.has(key) && !attackSet.has(key)) {
          cell.className = 'combat-threat-cell';
        }

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

        // Visual effect overlay
        if (effectMap[key]) {
          var overlay = document.createElement('div');
          overlay.className = 'combat-cell-effect ' + effectMap[key];
          cell.appendChild(overlay);
        }

        // Render entity with animation support
        if (entity) {
          var emoji = document.createElement('span');
          emoji.textContent = entity.emoji;
          emoji.style.cssText = 'transition:transform 0.3s ease-out; display:inline-block; z-index:3; position:relative;';

          // Calculate slide offset if entity just moved
          if (entity._prevX !== null && entity._prevY !== null &&
              (entity._prevX !== entity.x || entity._prevY !== entity.y)) {
            var dx = (entity._prevX - entity.x) * (cellSize + 1);
            var dy = (entity._prevY - entity.y) * (cellSize + 1);
            emoji.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
            (function(el) {
              requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                  el.style.transform = 'translate(0, 0)';
                });
              });
            })(emoji);
          }

          if (entity.id === 'player') {
            emoji.style.filter = 'drop-shadow(0 0 3px var(--color-accent))';
          } else if (entity.type === 'enemy') {
            emoji.style.filter = 'drop-shadow(0 0 3px var(--color-danger))';
          }
          cell.appendChild(emoji);

          // Mini hull indicator for enemies
          if (entity.type === 'enemy') {
            var hpDot = document.createElement('div');
            var hpPct = entity.hull / entity.maxHull;
            hpDot.style.cssText = 'position:absolute; bottom:1px; left:50%; transform:translateX(-50%); ' +
              'width:' + Math.round(cellSize * 0.6) + 'px; height:2px; z-index:2; ' +
              'background:' + (hpPct > 0.5 ? 'var(--color-success)' : hpPct > 0.25 ? 'var(--color-warning)' : 'var(--color-danger)') + ';';
            cell.appendChild(hpDot);

            // Intention icon (sensor level 3+)
            var intent = intentionMap[entity.id];
            if (intent && isPlayerPhase) {
              var intentIcon = document.createElement('div');
              intentIcon.className = 'combat-intention-icon';
              intentIcon.textContent = intent.icon;
              var intentColor = intent.action === 'attack' ? 'var(--color-danger)' :
                               intent.action === 'advance' ? 'var(--color-warning)' :
                               'var(--text-muted)';
              intentIcon.style.color = intentColor;
              cell.appendChild(intentIcon);
            }
          }
        } else if (terrain === 'asteroid') {
          cell.textContent = '\u25C6';
          cell.style.color = 'var(--text-muted)';
          cell.style.fontSize = Math.round(cellSize * 0.4) + 'px';
        } else if (terrain === 'debris') {
          cell.textContent = '\u2591';
          cell.style.color = 'var(--text-muted)';
        } else if (terrain === 'mine') {
          cell.textContent = '\u26A0';
          cell.style.fontSize = Math.round(cellSize * 0.4) + 'px';
        }

        // Click handlers
        if (combat.phase === 'player_move') {
          if (moveSet.has(key) || (entity && entity.id === 'player')) {
            (function(cx, cy) {
              cell.addEventListener('click', function() {
                CombatEngine.movePlayer(cx, cy);
              });
            })(x, y);
          }
        } else if (combat.phase === 'player_action' && combat.selectedWeaponIdx !== null) {
          if (entity && entity.type === 'enemy' && attackSet.has(key)) {
            (function(eid) {
              cell.addEventListener('click', function() {
                CombatEngine.fireWeapon(eid);
              });
            })(entity.id);
          }
        }

        grid.appendChild(cell);
      }
    }

    screen.appendChild(grid);
  },

  // ─── Phase Info ─────────────────────────────────────────────

  _renderPhaseInfo(screen, combat) {
    var phaseLabel = {
      player_move: 'MOVE PHASE',
      player_action: 'ACTION PHASE',
      enemy: 'ENEMY TURN',
      yield_offer: 'ENEMY YIELDS',
      victory: combat.combatResult === 'victory_disabled' ? 'ENEMY DISABLED' : 'ENEMY DESTROYED',
    };

    var turnDiv = document.createElement('div');
    turnDiv.className = 'system-label';
    turnDiv.style.cssText = 'margin:var(--space-sm) 0; display:flex; justify-content:space-between; align-items:center;';

    var phaseText = document.createElement('span');
    phaseText.textContent = 'TURN ' + combat.turn + ' \u2014 ' + (phaseLabel[combat.phase] || combat.phase);
    turnDiv.appendChild(phaseText);

    // AP counter during player phases
    if (combat.phase === 'player_action' || combat.phase === 'player_move') {
      var apDiv = document.createElement('span');
      apDiv.style.cssText = 'color:var(--color-accent); font-size:var(--font-size-sm);';
      if (combat.phase === 'player_action') {
        apDiv.textContent = 'ACTIONS: ' + combat.actionsRemaining + '/' + combat.maxActions;
      } else {
        apDiv.textContent = 'AP: ' + combat.maxActions;
      }
      turnDiv.appendChild(apDiv);
    }

    screen.appendChild(turnDiv);

    if (combat.lastAction) {
      var actionLog = document.createElement('div');
      actionLog.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); ' +
        'margin-bottom:var(--space-sm); min-height:2em;';
      actionLog.textContent = combat.lastAction;
      screen.appendChild(actionLog);
    }

    // Sensor hint for new players
    var sensorLvl = CombatEngine._getSensorLevel();
    if (sensorLvl >= 2 && combat.turn === 1 && combat.phase === 'player_move') {
      var sensorHint = document.createElement('div');
      sensorHint.style.cssText = 'color:var(--color-nexus); font-size:var(--font-size-sm); opacity:0.7; margin-bottom:var(--space-xs);';
      if (sensorLvl >= 3) {
        sensorHint.textContent = '\u25C8 Sensors active \u2014 threat zones and enemy intentions displayed';
      } else {
        sensorHint.textContent = '\u25C8 Sensors active \u2014 enemy weapon data detected';
      }
      screen.appendChild(sensorHint);
    }

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
  },

  // ─── Actions ────────────────────────────────────────────────

  _renderActions(screen, combat) {
    var player = combat.entities.find(function(e) { return e.id === 'player'; });

    switch (combat.phase) {
      case 'player_move':
        this._renderMoveActions(screen, combat, player);
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

  _renderMoveActions(screen, combat, player) {
    var hint = document.createElement('div');
    hint.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin-bottom:var(--space-sm);';
    hint.textContent = 'Tap a highlighted cell to move, or tap your ship to stay.';
    screen.appendChild(hint);

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:var(--space-xs);';

    // Flee button if at edge
    if (CombatEngine._isAtEdge(player)) {
      btnRow.appendChild(this._actionBtn('\uD83C\uDFC3 FLEE (edge)', 'var(--color-warning)',
        function() { CombatEngine.attemptFlee(); }));
    }

    // End Turn — skip move and all actions
    btnRow.appendChild(this._actionBtn('\u23ED END TURN', 'var(--text-muted)',
      function() { CombatEngine.endTurn(); }));

    // Surrender always available
    btnRow.appendChild(this._actionBtn('\uD83C\uDFF3 SURRENDER', 'var(--color-danger)',
      function() { CombatEngine.surrender(); }));

    screen.appendChild(btnRow);
  },

  _renderCombatActions(screen, combat, player) {
    var noAP = combat.actionsRemaining <= 0;

    var actionsRow = document.createElement('div');
    actionsRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:var(--space-xs);';

    // Weapon buttons
    for (var i = 0; i < player.weapons.length; i++) {
      var wpn = player.weapons[i];
      var selected = combat.selectedWeaponIdx === i;
      var hasAmmo = wpn._ammo === null || wpn._ammo > 0;
      var ammoStr = wpn._ammo !== null ? ' (' + wpn._ammo + ')' : '';

      var btn = this._actionBtn(
        '\u2694 ' + wpn.name + ammoStr,
        selected ? 'var(--color-accent)' : 'var(--border)',
        (function(idx) { return function() { CombatEngine.selectWeapon(idx); }; })(i)
      );
      if (!hasAmmo || noAP) {
        btn.style.opacity = '0.4';
        btn.style.pointerEvents = 'none';
      }
      actionsRow.appendChild(btn);
    }

    screen.appendChild(actionsRow);

    // Utility actions row
    var utilRow = document.createElement('div');
    utilRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:var(--space-xs); margin-top:var(--space-xs);';

    var defendBtn = this._actionBtn('\uD83D\uDEE1 DEFEND', 'var(--border)',
      function() { CombatEngine.playerDefend(); });
    var repairBtn = this._actionBtn('\uD83D\uDD27 REPAIR', 'var(--border)',
      function() { CombatEngine.playerRepair(); });

    if (noAP) {
      defendBtn.style.opacity = '0.4';
      defendBtn.style.pointerEvents = 'none';
      repairBtn.style.opacity = '0.4';
      repairBtn.style.pointerEvents = 'none';
    }

    utilRow.appendChild(defendBtn);
    utilRow.appendChild(repairBtn);

    // Scan button — targets first unscanned enemy
    var unscanned = combat.entities.find(function(e) { return e.type === 'enemy' && e.hull > 0 && !e.scanned; });
    if (unscanned) {
      var scanBtn = this._actionBtn('\uD83D\uDCE1 SCAN', 'var(--border)',
        (function(eid) { return function() { CombatEngine.playerScan(eid); }; })(unscanned.id));
      if (noAP) {
        scanBtn.style.opacity = '0.4';
        scanBtn.style.pointerEvents = 'none';
      }
      utilRow.appendChild(scanBtn);
    }

    // End Turn button
    utilRow.appendChild(this._actionBtn('\u23ED END TURN', 'var(--text-muted)',
      function() { CombatEngine.endTurn(); }));

    screen.appendChild(utilRow);

    // Weapon info hint
    if (combat.selectedWeaponIdx !== null) {
      var selWpn = player.weapons[combat.selectedWeaponIdx];
      var hint = document.createElement('div');
      hint.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:var(--space-xs);';
      hint.textContent = selWpn.name + ': ' + selWpn.type + ' \u2022 dmg ' + selWpn.damage + ' \u2022 range ' + selWpn.range + ' \u2014 tap a target';
      screen.appendChild(hint);
    }
  },

  _renderWaiting(screen) {
    var waiting = document.createElement('div');
    waiting.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); text-align:center;';
    waiting.textContent = 'Enemy taking action...';
    screen.appendChild(waiting);
  },

  _renderYieldOffer(screen, combat) {
    var target = combat.entities.find(function(e) { return e.id === combat._yieldingEntity; });
    var name = target ? target.name : 'Enemy';

    var panel = document.createElement('div');
    panel.style.cssText = 'border:1px solid var(--color-warning); padding:var(--space-md); ' +
      'margin:var(--space-sm) 0; background:rgba(255,213,128,0.05);';

    var title = document.createElement('div');
    title.className = 'system-label';
    title.style.color = 'var(--color-warning)';
    title.textContent = name.toUpperCase() + ' SIGNALS SURRENDER';
    panel.appendChild(title);

    var desc = document.createElement('div');
    desc.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin:var(--space-sm) 0;';
    desc.textContent = 'The enemy vessel is crippled. Their weapons are powering down.';
    panel.appendChild(desc);

    panel.appendChild(this._actionBtn('ACCEPT \u2014 Disable & Board', 'var(--color-success)',
      function() { CombatEngine.acceptYield(); }));

    panel.appendChild(this._actionBtn('REJECT \u2014 Destroy Them', 'var(--color-danger)',
      function() { CombatEngine.rejectYield(); }));

    screen.appendChild(panel);
  },

  _renderVictory(screen, combat) {
    var panel = document.createElement('div');
    panel.style.cssText = 'border:1px solid var(--color-success); padding:var(--space-md); ' +
      'margin:var(--space-sm) 0; background:rgba(135,214,141,0.05); text-align:center;';

    var title = document.createElement('div');
    title.className = 'system-label';
    title.style.color = 'var(--color-success)';
    title.textContent = combat.combatResult === 'victory_disabled' ? 'ENEMY DISABLED' : 'ENEMY DESTROYED';
    panel.appendChild(title);

    var continueBtn = this._actionBtn('CONTINUE', 'var(--color-accent)',
      function() { CombatEngine.endCombatAndReturn(); });
    continueBtn.style.marginTop = 'var(--space-md)';
    panel.appendChild(continueBtn);

    screen.appendChild(panel);
  },

  // ─── Defeat Screen ──────────────────────────────────────────

  _renderDefeatScreen(screen, combat) {
    var stats = combat.defeatStats || {};

    screen.style.cssText = 'padding:var(--space-md); display:flex; flex-direction:column; ' +
      'align-items:center; justify-content:center; min-height:80vh; text-align:center;';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:var(--font-size-xl); color:var(--color-danger); ' +
      'margin-bottom:var(--space-lg); letter-spacing:0.15em;';
    title.textContent = 'VESSEL DESTROYED';
    screen.appendChild(title);

    var subtitle = document.createElement('div');
    subtitle.style.cssText = 'color:var(--text-secondary); margin-bottom:var(--space-lg); line-height:1.6;';
    subtitle.textContent = 'Your ship has been torn apart. The void claims another.';
    screen.appendChild(subtitle);

    // Stats panel
    var statsPanel = document.createElement('div');
    statsPanel.style.cssText = 'border:1px solid var(--color-danger); padding:var(--space-md); ' +
      'background:rgba(255,107,107,0.05); margin-bottom:var(--space-lg); min-width:240px;';

    var statLines = [
      ['ENGAGED', stats.enemyName || 'Unknown'],
      ['TURNS SURVIVED', String(stats.turnsLasted || 0)],
      ['ENEMIES DESTROYED', (stats.enemiesDestroyed || 0) + '/' + (stats.totalEnemies || 0)],
    ];

    for (var i = 0; i < statLines.length; i++) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; margin:var(--space-xs) 0; font-size:var(--font-size-sm);';
      row.innerHTML = '<span class="system-label">' + statLines[i][0] + '</span>' +
        '<span style="color:var(--text-secondary)">' + statLines[i][1] + '</span>';
      statsPanel.appendChild(row);
    }

    screen.appendChild(statsPanel);

    var btn = this._actionBtn('ACCEPT FATE', 'var(--color-danger)',
      function() { CombatEngine.confirmDefeat(); });
    btn.style.cssText = 'min-width:200px; padding:var(--space-md); font-size:var(--font-size-md); ' +
      'border-color:var(--color-danger);';
    screen.appendChild(btn);
  },

  _actionBtn(text, borderColor, onClick) {
    var btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.style.cssText = 'flex:1; min-width:120px; border-color:' + borderColor + '; ' +
      'padding:var(--space-sm) var(--space-md); font-size:var(--font-size-sm); margin:2px 0;';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  },
};
