/* Void Meridian — Event Tab Renderer (events_master.json schema) */

const EventUI = {
  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const evt = GameState.run.activeEvent;

    if (!evt) {
      this._renderShipStatus(screen);
      container.appendChild(screen);
      return;
    }

    // Node type indicator
    if (evt.node_type) {
      const nodeLabel = document.createElement('div');
      nodeLabel.className = 'system-label';
      nodeLabel.style.marginBottom = 'var(--space-sm)';
      nodeLabel.textContent = evt.node_type.toUpperCase().replace(/_/g, ' ');
      screen.appendChild(nodeLabel);
    }

    // Event setup text (shown once at event start)
    const stepIdx = GameState.run.activeEventStep;
    if (stepIdx === 0 && evt.setup_text) {
      const setupEl = document.createElement('div');
      setupEl.className = 'narrative';
      setupEl.textContent = evt.setup_text;
      screen.appendChild(setupEl);
    }

    // Current step
    const step = evt.steps ? evt.steps[stepIdx] : null;
    if (!step) {
      // No valid step — show continue button
      this._renderContinueButton(screen, evt);
      container.appendChild(screen);
      return;
    }

    // Step setup text
    if (step.setup_text) {
      const stepSetup = document.createElement('div');
      stepSetup.className = 'narrative';
      if (stepIdx === 0 && evt.setup_text) {
        stepSetup.style.marginTop = 'var(--space-md)';
      }
      stepSetup.textContent = step.setup_text;
      screen.appendChild(stepSetup);
    }

    // Divider before choices/outcome
    const divider = document.createElement('hr');
    divider.className = 'divider';
    screen.appendChild(divider);

    // If outcome was resolved, show it
    if (evt._resolved && evt._lastOutcome) {
      this._renderOutcome(screen, evt);
      container.appendChild(screen);
      return;
    }

    // Render options
    if (step.options) {
      for (let i = 0; i < step.options.length; i++) {
        const option = step.options[i];
        const { available, hint } = EventEngine.checkOptionAvailability(option);

        // Hidden if locked and no locked_hint
        if (!available && !hint) continue;

        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (!available ? ' locked' : '');

        let label = option.label || 'Choose';
        if (option.check_type && option.check_type !== 'none') {
          label += ` [${option.check_target || option.check_type}]`;
        }
        btn.textContent = label;

        if (!available) {
          // Show locked hint
          const reason = document.createElement('span');
          reason.className = 'lock-reason';
          reason.textContent = hint;
          btn.appendChild(reason);
        } else {
          const optIdx = i;
          btn.addEventListener('click', () => EventEngine.selectOption(optIdx));
        }

        screen.appendChild(btn);
      }
    }

    container.appendChild(screen);
  },

  _renderOutcome(screen, evt) {
    const outcome = evt._lastOutcome;

    // Outcome level indicator
    const levelEl = document.createElement('div');
    levelEl.className = 'system-label';
    levelEl.style.marginBottom = 'var(--space-sm)';
    const levelColors = { success: 'var(--color-success)', partial: 'var(--color-warning)', failure: 'var(--color-danger)' };
    levelEl.style.color = levelColors[evt._lastOutcomeLevel] || 'var(--text-accent)';
    levelEl.textContent = (evt._lastOutcomeLevel || 'success').toUpperCase();
    screen.appendChild(levelEl);

    // Narrative text
    if (outcome.narrative) {
      const narrativeEl = document.createElement('div');
      narrativeEl.className = 'narrative';
      narrativeEl.textContent = outcome.narrative;
      screen.appendChild(narrativeEl);
    }

    // Show rewards summary
    const effects = this._summarizeOutcome(outcome);
    if (effects.length > 0) {
      const effectsEl = document.createElement('div');
      effectsEl.style.cssText = 'margin-top:var(--space-sm); color:var(--text-muted); font-size:var(--font-size-sm);';
      effectsEl.innerHTML = effects.join('<br>');
      screen.appendChild(effectsEl);
    }

    // Continue button
    const hasMoreSteps = this._hasMoreSteps(evt);
    const btnText = hasMoreSteps ? 'CONTINUE' : 'DONE';
    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn-confirm';
    continueBtn.style.marginTop = 'var(--space-md)';
    continueBtn.textContent = btnText;
    continueBtn.addEventListener('click', () => EventEngine.advanceEvent());
    screen.appendChild(continueBtn);
  },

  _hasMoreSteps(evt) {
    const currentIdx = GameState.run.activeEventStep;
    if (!evt.steps) return false;
    for (let i = currentIdx + 1; i < evt.steps.length; i++) {
      const step = evt.steps[i];
      if (!step.condition) return true;
      const priorOutcome = GameState.run.lastStepOutcomes[step.condition.prior_step];
      if (priorOutcome === step.condition.outcome) return true;
    }
    return false;
  },

  _summarizeOutcome(outcome) {
    const effects = [];
    if (outcome.hull_delta > 0) effects.push(`Hull +${outcome.hull_delta}%`);
    if (outcome.hull_delta < 0) effects.push(`Hull ${outcome.hull_delta}%`);
    if (outcome.morale_delta > 0) effects.push(`Morale +${outcome.morale_delta}`);
    if (outcome.morale_delta < 0) effects.push(`Morale ${outcome.morale_delta}`);
    if (outcome.resonance_delta > 0) effects.push(`Resonance +${outcome.resonance_delta}`);
    if (outcome.rewards) {
      for (const r of outcome.rewards) {
        if (r.description) effects.push(r.description);
        else if (r.type === 'credits' && r.value > 0) effects.push(`+${r.value} credits`);
        else if (r.type === 'credits' && r.value < 0) effects.push(`${r.value} credits`);
        else if (r.type === 'fuel' && r.value > 0) effects.push(`+${r.value} fuel`);
        else if (r.type === 'fuel' && r.value < 0) effects.push(`${r.value} fuel`);
        else if (r.type === 'hull_repair') effects.push(`Hull repaired +${r.value}%`);
      }
    }
    return effects;
  },

  _renderContinueButton(screen, evt) {
    const btn = document.createElement('button');
    btn.className = 'btn-confirm';
    btn.textContent = 'CONTINUE';
    btn.addEventListener('click', () => EventEngine.advanceEvent());
    screen.appendChild(btn);
  },

  _renderShipStatus(screen) {
    const ship = GameState.run.ship;
    const run = GameState.run;

    const title = document.createElement('div');
    title.className = 'section-header';
    title.textContent = 'THE MERIDIAN';
    screen.appendChild(title);

    // Hull bar
    const hullPct = ship.maxHull > 0 ? Math.round((ship.hull / ship.maxHull) * 100) : 0;
    screen.appendChild(this._createStatBar('HULL', hullPct, hullPct <= 25 ? 'danger' : hullPct <= 50 ? 'warning' : ''));

    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));

    // Base systems
    const sysHeader = document.createElement('div');
    sysHeader.className = 'system-label';
    sysHeader.style.marginBottom = 'var(--space-sm)';
    sysHeader.textContent = 'SYSTEMS';
    screen.appendChild(sysHeader);

    for (const [name, sys] of Object.entries(ship.baseSystems)) {
      const pct = Math.round((sys.level / sys.maxLevel) * 100);
      screen.appendChild(this._createStatBar(
        name.toUpperCase() + (sys.damaged ? ' [DMG]' : ''),
        pct
      ));
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
