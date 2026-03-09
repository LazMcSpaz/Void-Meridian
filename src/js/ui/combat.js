/* Void Meridian — Combat Screen Renderer */

const CombatUI = {
  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const combat = GameState.run.activeCombat;
    if (!combat) {
      screen.innerHTML = '<p style="color:var(--text-muted)">No active combat.</p>';
      container.appendChild(screen);
      return;
    }

    // Enemy info
    const enemyHeader = document.createElement('div');
    enemyHeader.className = 'section-header';
    enemyHeader.textContent = `${combat.enemy.emoji || '🚀'} ${combat.enemy.name}`;
    screen.appendChild(enemyHeader);

    // Enemy hull
    const enemyHullPct = combat.enemy.maxHull > 0
      ? Math.round((combat.enemy.hull / combat.enemy.maxHull) * 100) : 0;
    screen.appendChild(this._statBar('ENEMY HULL', enemyHullPct, enemyHullPct <= 25 ? 'danger' : ''));

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));

    // Player hull
    const ship = GameState.run.ship;
    const hullPct = ship.maxHull > 0 ? Math.round((ship.hull / ship.maxHull) * 100) : 0;
    screen.appendChild(this._statBar('YOUR HULL', hullPct, hullPct <= 25 ? 'danger' : hullPct <= 50 ? 'warning' : ''));

    // Turn indicator
    const turnInfo = document.createElement('div');
    turnInfo.className = 'system-label';
    turnInfo.style.cssText = 'margin:var(--space-md) 0;';
    turnInfo.textContent = `TURN ${combat.turn} — ${combat.playerTurn ? 'YOUR ACTION' : 'ENEMY ACTION'}`;
    screen.appendChild(turnInfo);

    if (combat.lastAction) {
      const actionLog = document.createElement('div');
      actionLog.className = 'narrative';
      actionLog.style.fontSize = 'var(--font-size-sm)';
      actionLog.textContent = combat.lastAction;
      screen.appendChild(actionLog);
    }

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));

    // Player actions (only on player turn)
    if (combat.playerTurn) {
      const stations = [
        { id: 'weapons', label: '⚔ FIRE WEAPONS', desc: 'Attack the enemy ship' },
        { id: 'defense', label: '🛡 RAISE SHIELDS', desc: 'Reduce incoming damage' },
        { id: 'helm', label: '🚀 EVASIVE MANEUVER', desc: 'Chance to dodge next attack' },
        { id: 'engineering', label: '🔧 REPAIR', desc: 'Restore hull integrity' },
        { id: 'tactical', label: '📡 SCAN', desc: 'Reveal enemy weakness' },
      ];

      for (const station of stations) {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.innerHTML = `${station.label}<br><span style="font-size:var(--font-size-sm);color:var(--text-secondary)">${station.desc}</span>`;
        btn.addEventListener('click', () => CombatEngine.playerAction(station.id));
        screen.appendChild(btn);
      }

      // Flee / Surrender
      screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));

      const fleeBtn = document.createElement('button');
      fleeBtn.className = 'choice-btn';
      fleeBtn.style.borderColor = 'var(--color-warning)';
      fleeBtn.textContent = '🏃 FLEE';
      fleeBtn.addEventListener('click', () => CombatEngine.attemptFlee());
      screen.appendChild(fleeBtn);

      const surrenderBtn = document.createElement('button');
      surrenderBtn.className = 'choice-btn';
      surrenderBtn.style.borderColor = 'var(--color-danger)';
      surrenderBtn.textContent = '🏳 SURRENDER';
      surrenderBtn.addEventListener('click', () => CombatEngine.surrender());
      screen.appendChild(surrenderBtn);
    }

    container.appendChild(screen);
  },

  _statBar(label, percent, variant) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    const el = document.createElement('div');
    el.className = 'stat-bar' + (variant ? ` ${variant}` : '');
    el.innerHTML = `<span class="system-label">${label}</span> <span class="stat-bar-fill">${'█'.repeat(filled)}</span><span class="stat-bar-empty">${'░'.repeat(empty)}</span> ${percent}%`;
    return el;
  },
};
