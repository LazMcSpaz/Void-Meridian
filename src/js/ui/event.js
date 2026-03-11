/* Void Meridian — Event Tab Renderer (events_master.json schema) */

const EventUI = {

  // ─── Narrative Colorizer ─────────────────────────────────────

  _NARRATIVE_KEYWORDS: null,
  _NARRATIVE_REGEX: null,

  _buildColorizer() {
    if (this._NARRATIVE_REGEX) return;

    const keywords = {
      // Threats (red)
      'var(--color-danger)': [
        'weapons drawn', 'fighter craft', 'hull breach', 'critical damage',
        'fire upon', 'weapons fire', 'boarding party', 'self-destruct',
        'weapons', 'hostile', 'attack', 'destroy', 'ambush', 'pirates',
        'enemy', 'armed', 'boarding', 'missiles', 'torpedo', 'explode',
        'raiders', 'intercept', 'killed', 'dead', 'death', 'lethal',
        'predator', 'predators', 'threat', 'breach', 'detonation',
        'overload', 'combat', 'wreckage', 'carnage', 'annihilate',
      ],
      // Caution (orange)
      'var(--color-warning)': [
        'warning', 'unstable', 'malfunction', 'failing', 'leak',
        'drifting', 'sacrifice', 'risk', 'cost', 'price', 'damaged',
        'stranded', 'distress', 'danger', 'trapped', 'quarantine',
        'contaminated', 'radiation', 'corrosion', 'decay',
      ],
      // Gains (green)
      'var(--color-success)': [
        'repaired', 'salvage', 'recovered', 'credits', 'fuel cells',
        'upgrade', 'ally', 'allies', 'safe', 'healed', 'restored',
        'reward', 'rescued', 'gained', 'profit', 'trade', 'supplies',
        'repair', 'reinforced', 'intact', 'fortune',
      ],
      // Nexus / mystery (purple)
      'var(--color-nexus)': [
        'nexus', 'resonance', 'the void', 'whisper', 'whispers',
        'pattern', 'remember', 'the wound', 'pulse', 'meridian',
        'reconstruction', 'anomaly', 'anomalous', 'transmission',
        'tendrils', 'tendril', 'integration', 'cortex',
      ],
      // Factions
      'var(--faction-concord)': ['concord assembly', 'concord'],
      'var(--faction-vreth)': ['vreth dominion', 'vreth'],
      'var(--faction-drifter)': ['drifter compact', 'drifter', 'drifters'],
      'var(--faction-remnant)': ['remnant collective', 'remnant'],
    };

    // Build flat list sorted longest-first
    const entries = [];
    for (const [color, words] of Object.entries(keywords)) {
      for (const word of words) {
        entries.push({ word, color });
      }
    }
    entries.sort((a, b) => b.word.length - a.word.length);

    this._NARRATIVE_KEYWORDS = entries;

    // Build single regex with alternation, word boundaries
    const escaped = entries.map(e => e.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    this._NARRATIVE_REGEX = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'gi');
  },

  _colorizeNarrative(text) {
    if (!text) return '';
    this._buildColorizer();

    // HTML-escape first
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Build a lookup map from lowercase word to color
    const colorMap = {};
    for (const entry of this._NARRATIVE_KEYWORDS) {
      colorMap[entry.word.toLowerCase()] = entry.color;
    }

    // Negation patterns — if a danger/warning word is negated, don't color it
    const negationRe = /\b(?:not|no|don't|won't|never|without|isn't|aren't|wasn't|weren't|cannot|can't)\s+$/i;
    const negatedColors = new Set(['var(--color-danger)', 'var(--color-warning)']);

    // Replace matches with colored spans, preserving original case
    html = html.replace(this._NARRATIVE_REGEX, (match, _g, offset, full) => {
      const color = colorMap[match.toLowerCase()];
      if (!color) return match;
      // Check for negation before danger/warning words
      if (negatedColors.has(color)) {
        const before = full.substring(Math.max(0, offset - 20), offset);
        if (negationRe.test(before)) return match;
      }
      return `<span style="color:${color}">${match}</span>`;
    });

    return html;
  },

  render(container) {
    // Delegate to interaction UI if a crew interaction is active
    if (GameState.run.activeInteraction) {
      InteractionUI.render(container);
      return;
    }

    const screen = document.createElement('div');
    screen.className = 'screen';

    const evt = GameState.run.activeEvent;

    if (!evt) {
      this._renderShipStatus(screen);
      container.appendChild(screen);
      return;
    }

    // If outcome was resolved, show ONLY the outcome (clean page)
    if (evt._resolved && evt._lastOutcome) {
      this._renderOutcome(screen, evt);
      container.appendChild(screen);
      return;
    }

    // Current step
    const stepIdx = GameState.run.activeEventStep;
    const step = evt.steps ? evt.steps[stepIdx] : null;

    if (!step) {
      this._renderContinueButton(screen, evt);
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

    // For step 0, show the event setup_text as the intro
    // For later steps, only show the step's own setup_text
    if (stepIdx === 0 && evt.setup_text) {
      const setupEl = document.createElement('div');
      setupEl.className = 'narrative';
      setupEl.innerHTML = this._colorizeNarrative(evt.setup_text);
      screen.appendChild(setupEl);
    }

    // Step-specific setup text
    if (step.setup_text) {
      const stepSetup = document.createElement('div');
      stepSetup.className = 'narrative';
      if (stepIdx === 0 && evt.setup_text) {
        stepSetup.style.marginTop = 'var(--space-md)';
      }
      stepSetup.innerHTML = this._colorizeNarrative(step.setup_text);
      screen.appendChild(stepSetup);
    }

    // Divider before choices
    const divider = document.createElement('hr');
    divider.className = 'divider';
    screen.appendChild(divider);

    // Render options
    if (step.options) {
      // Gut Feeling: reveal one hidden option (no hint = normally invisible)
      const hasGutFeeling = GameState.run.captain.abilities.includes('gut_feeling');
      let gutFeelingRevealed = false;

      for (let i = 0; i < step.options.length; i++) {
        const option = step.options[i];
        const { available, hint } = EventEngine.checkOptionAvailability(option);

        // Normally hidden options (unavailable with no hint) — Gut Feeling can reveal one
        if (!available && !hint) {
          if (hasGutFeeling && !gutFeelingRevealed) {
            gutFeelingRevealed = true;
            // Show as a revealed-by-intuition option
            const btn = document.createElement('button');
            btn.className = 'choice-btn locked';
            btn.style.borderColor = 'var(--color-nexus)';
            let label = option.label || 'Choose';
            if (option.check_type && option.check_type !== 'none') {
              label += ` [${option.check_target || option.check_type}]`;
            }
            btn.textContent = label;
            const reason = document.createElement('span');
            reason.className = 'lock-reason';
            reason.style.color = 'var(--color-nexus)';
            reason.textContent = '⟡ Gut Feeling — requirements not met';
            btn.appendChild(reason);
            screen.appendChild(btn);
          }
          continue;
        }

        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (!available ? ' locked' : '');

        let label = option.label || 'Choose';
        if (option.check_type && option.check_type !== 'none') {
          label += ` [${option.check_target || option.check_type}]`;
        }
        btn.textContent = label;

        if (!available) {
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

    // Show what the player chose
    if (evt._lastChoiceLabel) {
      const choiceEl = document.createElement('div');
      choiceEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-sm); text-transform:uppercase;';
      choiceEl.textContent = `▸ ${evt._lastChoiceLabel}`;
      screen.appendChild(choiceEl);
    }

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
      narrativeEl.innerHTML = this._colorizeNarrative(outcome.narrative);
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

    // Crew bark — a crew member reacts to the outcome
    const bark = CrewEngine.getEventBark(evt._lastOutcomeLevel, outcome);
    if (bark) {
      const barkEl = document.createElement('div');
      barkEl.style.cssText = 'margin-top:var(--space-md); padding:var(--space-sm) var(--space-md); border-left:2px solid var(--text-muted); color:var(--text-secondary); font-size:var(--font-size-sm);';
      const nameSpan = `<span style="color:var(--text-accent)">${bark.speaker.emoji} ${bark.speaker.name}</span>`;
      barkEl.innerHTML = `${nameSpan}<br><span style="font-style:italic">${bark.line}</span>`;
      screen.appendChild(barkEl);
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
      // Delegate to EventEngine's condition check (handles flags + outcome)
      if (EventEngine._stepConditionMet(step)) return true;
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

    const sysNames = ShipEngine.SYSTEM_NAMES;
    for (const [key, sys] of Object.entries(ship.baseSystems)) {
      const pct = Math.round((sys.level / sys.maxLevel) * 100);
      const displayName = (sysNames[key] || key).toUpperCase();
      screen.appendChild(this._createStatBar(
        displayName + (sys.damaged ? ' [DMG]' : ''),
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

    // Weapons
    if (ship.equippedWeapons && ship.equippedWeapons.length > 0) {
      screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
      const wpnHeader = document.createElement('div');
      wpnHeader.className = 'system-label';
      wpnHeader.style.marginBottom = 'var(--space-sm)';
      wpnHeader.textContent = 'WEAPONS';
      screen.appendChild(wpnHeader);

      for (const wpn of ship.equippedWeapons) {
        const wpnEl = document.createElement('div');
        wpnEl.style.cssText = 'margin-bottom:var(--space-xs); color:var(--text-secondary);';
        const emoji = wpn.type === 'nexus_energy' ? '◈' : (wpn.emoji || '⚔');
        let tags = '';
        if (wpn.irremovable) tags += ' [⬡]';
        if (typeof wpn._currentAmmo === 'number') tags += ` [${wpn._currentAmmo}/${wpn.stats.ammo}]`;
        if (wpn._currentCharges > 0) tags += ` ◆${wpn._currentCharges}`;
        wpnEl.textContent = `${emoji} ${wpn.name}${tags}`;
        if (wpn.tier === 3) wpnEl.style.color = 'var(--color-nexus)';
        screen.appendChild(wpnEl);
      }
    }

    // Modules
    if (ship.equippedModules.length > 0) {
      screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
      const modHeader = document.createElement('div');
      modHeader.className = 'system-label';
      modHeader.style.marginBottom = 'var(--space-sm)';
      modHeader.textContent = 'MODULES (tap for details)';
      screen.appendChild(modHeader);

      for (const mod of ship.equippedModules) {
        const modEl = document.createElement('div');
        modEl.style.cssText = 'margin-bottom:var(--space-xs); color:var(--text-secondary); cursor:pointer; padding:var(--space-xs) 0;';
        const emoji = mod.nexus_integrated ? '◈' : (mod.emoji || '◻');
        let tags = '';
        if (mod.irremovable) tags += ' [⬡]';
        if (mod.nexus_integrated) tags += ' [◈]';
        modEl.textContent = `${emoji} ${mod.name}${tags}`;
        if (mod.tier === 3) modEl.style.color = 'var(--color-nexus)';
        if (mod.nexus_integrated) modEl.style.fontStyle = 'italic';

        modEl.addEventListener('click', () => {
          this._showModuleDetail(mod);
        });

        screen.appendChild(modEl);
      }
    }

    // Cargo Hold
    screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
    const cargoHeader = document.createElement('div');
    cargoHeader.className = 'system-label';
    cargoHeader.style.marginBottom = 'var(--space-sm)';
    const cargoCapacity = ShipEngine.getCargoCapacity();
    const cargoCount = (ship.cargo || []).length;
    cargoHeader.textContent = `CARGO HOLD (${cargoCount}/${cargoCapacity})`;
    screen.appendChild(cargoHeader);

    if (cargoCount > 0) {
      for (const item of ship.cargo) {
        const itemEl = document.createElement('div');
        itemEl.style.cssText = 'margin-bottom:var(--space-xs); color:var(--text-secondary); font-size:var(--font-size-sm);';
        const displayName = item.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        itemEl.textContent = '\uD83D\uDCE6 ' + displayName;
        screen.appendChild(itemEl);
      }
    } else {
      const emptyEl = document.createElement('div');
      emptyEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm);';
      emptyEl.textContent = 'Empty';
      screen.appendChild(emptyEl);
    }

    // Lore fragments
    const lore = run.loreFragments || [];
    if (lore.length > 0) {
      screen.appendChild(Object.assign(document.createElement('hr'), { className: 'divider' }));
      const loreHeader = document.createElement('div');
      loreHeader.className = 'system-label';
      loreHeader.style.marginBottom = 'var(--space-sm)';
      loreHeader.textContent = `DISCOVERIES (${lore.length})`;
      screen.appendChild(loreHeader);

      for (const fragment of lore) {
        const fragEl = document.createElement('div');
        fragEl.style.cssText = 'margin-bottom:var(--space-xs); color:var(--text-secondary); font-size:var(--font-size-sm);';
        fragEl.textContent = `◆ ${fragment.description}`;
        screen.appendChild(fragEl);
      }
    }
  },

  // ─── Module Detail Overlay ─────────────────────────────────────

  _showModuleDetail(mod) {
    // Remove existing overlay if any
    const existing = document.getElementById('module-detail-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'module-detail-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); padding:var(--space-lg);';

    const card = document.createElement('div');
    card.style.cssText = 'max-width:400px; width:100%; padding:var(--space-lg); background:var(--bg-secondary); border:1px solid var(--border);';

    // Name
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'color:var(--text-primary); font-size:var(--font-size-lg); margin-bottom:var(--space-sm);';
    const emoji = mod.nexus_integrated ? '◈' : (mod.emoji || '◻');
    nameEl.textContent = `${emoji} ${mod.name}`;
    if (mod.tier === 3) nameEl.style.color = 'var(--color-nexus)';
    card.appendChild(nameEl);

    // Slot
    const slotEl = document.createElement('div');
    slotEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); text-transform:uppercase; margin-bottom:var(--space-sm);';
    slotEl.textContent = `T${mod.tier || 1} Module — ${ShipEngine.SYSTEM_NAMES[mod.slots_onto] || mod.slots_onto}`;
    card.appendChild(slotEl);

    // Effect
    if (mod.effect) {
      const effEl = document.createElement('div');
      effEl.style.cssText = 'color:var(--text-accent); margin-bottom:var(--space-sm);';
      effEl.textContent = mod.effect;
      card.appendChild(effEl);
    }

    // Flavor
    if (mod.flavor) {
      const flavEl = document.createElement('div');
      flavEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); font-style:italic; margin-bottom:var(--space-md);';
      flavEl.textContent = mod.flavor;
      card.appendChild(flavEl);
    }

    // Tags
    if (mod.irremovable) {
      const tagEl = document.createElement('div');
      tagEl.style.cssText = 'color:var(--color-warning); font-size:var(--font-size-sm); margin-bottom:var(--space-md);';
      tagEl.textContent = '[⬡] This module cannot be removed.';
      card.appendChild(tagEl);
    }

    // Uninstall button (if removable)
    if (!mod.irremovable) {
      const uninstallBtn = document.createElement('button');
      uninstallBtn.className = 'btn-confirm';
      uninstallBtn.style.cssText = 'margin-bottom:var(--space-sm); border-color:var(--color-danger); color:var(--color-danger);';
      uninstallBtn.textContent = 'UNINSTALL MODULE';
      uninstallBtn.addEventListener('click', () => {
        ShipEngine.removeModule(mod.id);
        GameState.save();
        overlay.remove();
        Game.render();
      });
      card.appendChild(uninstallBtn);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-confirm';
    closeBtn.style.cssText = 'border-color:var(--border); color:var(--text-secondary);';
    closeBtn.textContent = 'CLOSE';
    closeBtn.addEventListener('click', () => overlay.remove());
    card.appendChild(closeBtn);

    overlay.appendChild(card);

    // Close on background tap
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
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
