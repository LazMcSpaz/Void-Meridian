/* Void Meridian — Event Tab Renderer */

const EventUI = {
  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const evt = GameState.run.activeEvent;

    if (!evt) {
      // No active event — show ship status
      this._renderShipStatus(screen);
      container.appendChild(screen);
      return;
    }

    // Node type indicator
    if (evt.nodeType) {
      const nodeLabel = document.createElement('div');
      nodeLabel.className = 'system-label';
      nodeLabel.style.marginBottom = 'var(--space-sm)';
      nodeLabel.textContent = evt.nodeType.toUpperCase().replace('_', ' ');
      screen.appendChild(nodeLabel);
    }

    // Narrative text
    const narrative = document.createElement('div');
    narrative.className = 'narrative';
    narrative.innerHTML = evt.narrative || '';
    screen.appendChild(narrative);

    // Divider
    const divider = document.createElement('hr');
    divider.className = 'divider';
    screen.appendChild(divider);

    // Outcome display (if resolved)
    if (evt._outcome) {
      const outcome = document.createElement('div');
      outcome.className = 'narrative';
      outcome.style.marginTop = 'var(--space-md)';
      outcome.innerHTML = evt._outcome.text || '';
      screen.appendChild(outcome);

      // Continue button
      const continueBtn = document.createElement('button');
      continueBtn.className = 'btn-confirm';
      continueBtn.textContent = 'CONTINUE';
      continueBtn.addEventListener('click', () => {
        GameState.run.activeEvent = null;
        Tabs.switchTo('map');
      });
      screen.appendChild(continueBtn);

      container.appendChild(screen);
      return;
    }

    // Choices
    if (evt.choices) {
      for (const choice of evt.choices) {
        const btn = document.createElement('button');
        const locked = choice.requirements && !EventEngine.checkRequirements(choice.requirements);
        btn.className = 'choice-btn' + (locked ? ' locked' : '');

        let label = choice.text || 'Choose';
        if (choice.statCheck) {
          label += ` [${choice.statCheck.stat}]`;
        }
        btn.innerHTML = label;

        if (locked) {
          const reason = document.createElement('span');
          reason.className = 'lock-reason';
          reason.textContent = choice.lockReason || 'Requirements not met';
          btn.appendChild(reason);
        } else {
          btn.addEventListener('click', () => EventEngine.resolveChoice(evt, choice));
        }

        screen.appendChild(btn);
      }
    }

    container.appendChild(screen);
  },

  _renderShipStatus(screen) {
    const ship = GameState.run.ship;
    const run = GameState.run;

    // Ship name / visual placeholder
    const title = document.createElement('div');
    title.className = 'section-header';
    title.textContent = 'THE MERIDIAN';
    screen.appendChild(title);

    // Hull bar
    const hullPct = ship.maxHull > 0 ? Math.round((ship.hull / ship.maxHull) * 100) : 0;
    screen.appendChild(this._createStatBar('HULL', hullPct, hullPct <= 25 ? 'danger' : hullPct <= 50 ? 'warning' : ''));

    // Divider
    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));

    // Base systems
    const sysHeader = document.createElement('div');
    sysHeader.className = 'system-label';
    sysHeader.style.marginBottom = 'var(--space-sm)';
    sysHeader.textContent = 'SYSTEMS';
    screen.appendChild(sysHeader);

    for (const [name, sys] of Object.entries(ship.baseSystems)) {
      const pct = Math.round((sys.level / sys.maxLevel) * 100);
      const bar = this._createStatBar(
        name.toUpperCase() + (sys.damaged ? ' [DMG]' : ''),
        pct
      );
      screen.appendChild(bar);
    }

    // Resources
    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
    const res = document.createElement('div');
    res.innerHTML = `
      <span class="system-label">CREDITS</span> <span style="color:var(--color-credits)">₢${run.credits}</span>
      &nbsp;&nbsp;
      <span class="system-label">FUEL</span> <span>${run.fuel}</span>
      &nbsp;&nbsp;
      <span class="system-label">CREW</span> <span>${run.crew.filter(c => !c.dead).length}</span>
    `;
    screen.appendChild(res);

    // Modules
    if (ship.equippedModules.length > 0) {
      screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
      const modHeader = document.createElement('div');
      modHeader.className = 'system-label';
      modHeader.style.marginBottom = 'var(--space-sm)';
      modHeader.textContent = 'MODULES';
      screen.appendChild(modHeader);

      for (const mod of ship.equippedModules) {
        const modEl = document.createElement('div');
        modEl.style.cssText = 'margin-bottom:var(--space-xs); color:var(--text-secondary);';
        modEl.textContent = `${mod.emoji || '◻'} ${mod.name}`;
        screen.appendChild(modEl);
      }
    }
  },

  _createStatBar(label, percent, variant) {
    const filled = Math.round(percent / 10);
    const empty = 10 - filled;
    const el = document.createElement('div');
    el.className = 'stat-bar' + (variant ? ` ${variant}` : '');
    el.innerHTML = `<span class="system-label">${label}</span> <span class="stat-bar-fill">${'█'.repeat(filled)}</span><span class="stat-bar-empty">${'░'.repeat(empty)}</span> ${percent}%`;
    return el;
  },
};
