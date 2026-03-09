/* Void Meridian — Reconstruction Screen */

const ReconstructionUI = {
  phase: 'recap',  // recap | transmission | systems | captain | crew_pick | supplies | weapon_select | confirm
  recapLineIndex: 0,
  recapTimer: null,

  // Allocation tracking
  systems: null,      // { weapons: 0, propulsion: 0, sensors: 0, shields_armor: 0, cargo_hold: 0, crew_quarters: 0 }
  captainStats: null,  // { command: 0, intuition: 0, resolve: 0 }
  captainAbility: null,
  crewChoices: null,   // [{ role, quality }]  — up to 3 starter crew picks
  supplies: null,      // { credits: 0, fuel: 0 }
  selectedWeaponId: null,
  totalPoints: 0,
  spentPoints: 0,

  SYSTEM_INFO: {
    weapons:       { label: 'WEAPONS',          emoji: '⚔', desc: 'Damage output and weapon slot efficiency' },
    propulsion:    { label: 'PROPULSION',        emoji: '🚀', desc: 'Speed in combat, fuel efficiency' },
    sensors:       { label: 'SENSORS',           emoji: '📡', desc: 'Reveal map nodes, detect hidden events' },
    shields_armor: { label: 'SHIELDS / ARMOR',   emoji: '🛡', desc: 'Damage reduction and shield strength' },
    cargo_hold:    { label: 'CARGO HOLD',        emoji: '📦', desc: 'Max inventory slots and trade prices' },
    crew_quarters: { label: 'CREW QUARTERS',     emoji: '🏠', desc: 'Max crew, morale decay rate' },
  },

  CAPTAIN_STAT_INFO: {
    command:   { label: 'COMMAND',   emoji: '⚑', desc: 'Crew effectiveness, combat leadership, authority checks' },
    intuition: { label: 'INTUITION', emoji: '◉', desc: 'Hidden option discovery, trap avoidance, navigation' },
    resolve:   { label: 'RESOLVE',   emoji: '▣', desc: 'Morale protection, Nexus resistance, endurance checks' },
  },

  CAPTAIN_ABILITIES: [
    { id: 'rally_cry',       name: 'Rally Cry',       desc: '+10 crew morale once per 5 nodes. Command check bonus.', stat: 'command' },
    { id: 'gut_feeling',     name: 'Gut Feeling',     desc: 'Reveal one hidden option per event. Intuition check bonus.', stat: 'intuition' },
    { id: 'iron_will',       name: 'Iron Will',       desc: 'Prevent one crew death per run. Resolve check bonus.', stat: 'resolve' },
    { id: 'scavenger_eye',   name: 'Scavenger\'s Eye', desc: '+25% salvage from derelicts. Better trade prices.', stat: 'intuition' },
  ],

  CREW_ROLES: ['engineer', 'pilot', 'medic', 'soldier', 'technician', 'diplomat', 'scientist'],

  ROLE_INFO: {
    engineer:   { emoji: '🔧', desc: 'Repairs systems, improves module efficiency' },
    pilot:      { emoji: '🚀', desc: 'Evasion bonus, faster travel, escape options' },
    medic:      { emoji: '💉', desc: 'Heals crew conditions, prevents death rolls' },
    soldier:    { emoji: '⚔',  desc: 'Combat damage, boarding defense' },
    technician: { emoji: '💻', desc: 'Hacking, sensor boosts, module installation' },
    diplomat:   { emoji: '🤝', desc: 'Faction reputation gains, trade discounts' },
    scientist:  { emoji: '🔬', desc: 'Anomaly research, Nexus insight, lore discovery' },
  },

  render(container) {
    const screen = document.createElement('div');
    screen.className = 'fullscreen recon-screen';

    switch (this.phase) {
      case 'recap':        this._renderRecap(screen); break;
      case 'transmission': this._renderTransmission(screen); break;
      case 'systems':      this._renderSystems(screen); break;
      case 'captain':      this._renderCaptain(screen); break;
      case 'crew_pick':    this._renderCrewPick(screen); break;
      case 'supplies':     this._renderSupplies(screen); break;
      case 'weapon_select':this._renderWeaponSelect(screen); break;
      case 'confirm':      this._renderConfirm(screen); break;
    }

    container.appendChild(screen);
  },

  start() {
    this.phase = 'recap';
    this.totalPoints = GameState.getSalvagePoints();
    this.spentPoints = 0;
    this.systems = { weapons: 0, propulsion: 0, sensors: 0, shields_armor: 0, cargo_hold: 0, crew_quarters: 0 };
    this.captainStats = { command: 0, intuition: 0, resolve: 0 };
    this.captainAbility = null;
    this.crewChoices = [];
    this.supplies = { credits: 0, fuel: 0 };
    this.selectedWeaponId = null;
    this.recapLineIndex = 0;
    Game.render();
    this._startRecapAnimation();
  },

  _getRemaining() {
    return this.totalPoints - this.spentPoints;
  },

  _spendPoint() {
    if (this.spentPoints < this.totalPoints) { this.spentPoints++; return true; }
    return false;
  },

  _refundPoint() {
    if (this.spentPoints > 0) { this.spentPoints--; return true; }
    return false;
  },

  // ─── Phase Header ──────────────────────────────────────────────

  _renderPhaseHeader(screen, title, subtitle) {
    const hdr = document.createElement('div');
    hdr.style.cssText = 'text-align:center; margin-bottom:var(--space-lg); width:100%;';
    hdr.innerHTML = `
      <div class="section-header" style="border-bottom:none; margin-bottom:var(--space-xs);">${title}</div>
      <div style="color:var(--text-accent); font-size:var(--font-size-lg);">${this._getRemaining()} POINTS REMAINING</div>
      ${subtitle ? `<div style="color:var(--text-muted); font-size:var(--font-size-sm); margin-top:var(--space-xs);">${subtitle}</div>` : ''}
    `;
    screen.appendChild(hdr);
  },

  _renderNavButtons(screen, backPhase, nextPhase, nextLabel) {
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex; gap:var(--space-sm); width:100%; max-width:400px; margin-top:var(--space-lg);';

    if (backPhase) {
      const back = document.createElement('button');
      back.className = 'btn-confirm';
      back.style.cssText = 'flex:1; border-color:var(--border); color:var(--text-secondary);';
      back.textContent = '← BACK';
      back.addEventListener('click', () => { this.phase = backPhase; Game.render(); });
      nav.appendChild(back);
    }

    const next = document.createElement('button');
    next.className = 'btn-confirm';
    next.style.cssText = backPhase ? 'flex:2;' : 'flex:1;';
    next.textContent = nextLabel || 'NEXT →';
    next.addEventListener('click', () => { this.phase = nextPhase; Game.render(); });
    nav.appendChild(next);

    screen.appendChild(nav);
  },

  // ─── Recap & Transmission ──────────────────────────────────────

  _getRecapLines() {
    const last = GameState.meta.runHistory[GameState.meta.runHistory.length - 1];
    if (!last) {
      return [
        'NEXUS RECONSTRUCTION PROTOCOL',
        '...',
        'No prior vessel data found.',
        'Initializing from base pattern.',
      ];
    }
    return [
      'NEXUS RECONSTRUCTION PROTOCOL',
      '...',
      `PRIOR VESSEL LOST — SECTOR ${last.depth}`,
      `CAUSE: ${last.cause.toUpperCase()}`,
      `CREW LOST: ${last.crewLost}`,
      `SALVAGE RECOVERED: ₢${last.creditsEarned}`,
      '...',
      'RECONSTRUCTING.',
    ];
  },

  _startRecapAnimation() {
    const lines = this._getRecapLines();
    this.recapLineIndex = 0;

    const advance = () => {
      this.recapLineIndex++;
      Game.render();
      if (this.recapLineIndex < lines.length) {
        this.recapTimer = setTimeout(advance, 600);
      } else {
        this.recapTimer = setTimeout(() => {
          this.phase = 'transmission';
          Game.render();
        }, 1200);
      }
    };

    this.recapTimer = setTimeout(advance, 800);
  },

  _renderRecap(screen) {
    const lines = this._getRecapLines();
    const textArea = document.createElement('div');
    textArea.style.cssText = 'max-width:80vw; text-align:left;';

    for (let i = 0; i < Math.min(this.recapLineIndex, lines.length); i++) {
      const line = document.createElement('div');
      line.className = 'death-recap-line';
      line.style.animationDelay = '0s';
      line.style.color = 'var(--text-secondary)';
      line.textContent = lines[i];
      textArea.appendChild(line);
    }

    screen.appendChild(textArea);
  },

  _renderTransmission(screen) {
    const tier = GameState.getResonanceTier();
    const transmissions = [
      'you are not the first.',
      'i remember the shape of you.',
      'the pattern persists. you persist.',
      'each death teaches me more about what you are.',
      'we are becoming something neither of us intended.',
      'the wound calls. can you hear it now?',
    ];
    const text = transmissions[Math.min(tier, transmissions.length - 1)];

    const el = document.createElement('div');
    el.style.cssText = 'text-align:center;';
    el.innerHTML = `<div class="nexus-line" style="color:var(--color-nexus); font-style:italic; font-size:var(--font-size-nexus);">${text}</div>`;
    screen.appendChild(el);

    setTimeout(() => {
      this.phase = 'systems';
      Game.render();
    }, 3500);
  },

  // ─── Phase 1: Ship Systems ─────────────────────────────────────

  _renderSystems(screen) {
    this._renderPhaseHeader(screen, 'SHIP SYSTEMS', 'Allocate points to upgrade your vessel\'s base systems. Each point = +1 system level.');

    const area = document.createElement('div');
    area.style.cssText = 'width:100%; max-width:400px; overflow-y:auto; flex-shrink:1;';

    for (const [key, info] of Object.entries(this.SYSTEM_INFO)) {
      const val = this.systems[key];
      const row = document.createElement('div');
      row.className = 'alloc-category';

      const label = document.createElement('div');
      label.className = 'alloc-label';
      label.innerHTML = `${info.emoji} ${info.label} <span style="color:var(--text-muted); font-size:0.7rem;">(Lv ${1 + val})</span>`;
      row.appendChild(label);

      const desc = document.createElement('div');
      desc.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-xs);';
      desc.textContent = info.desc;
      row.appendChild(desc);

      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex; align-items:center; gap:var(--space-sm);';

      const minusBtn = document.createElement('button');
      minusBtn.className = 'alloc-btn';
      minusBtn.textContent = '−';
      minusBtn.addEventListener('click', () => {
        if (this.systems[key] > 0) {
          this.systems[key]--;
          this._refundPoint();
          Game.render();
        }
      });

      const pips = document.createElement('div');
      pips.style.cssText = 'flex:1; display:flex; gap:2px;';
      for (let i = 0; i < 5; i++) {
        const pip = document.createElement('div');
        pip.style.cssText = `height:8px; flex:1; border:1px solid var(--border); ${i < val ? 'background:var(--text-accent);' : ''}`;
        pips.appendChild(pip);
      }

      const plusBtn = document.createElement('button');
      plusBtn.className = 'alloc-btn';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        if (this.systems[key] < 4 && this._getRemaining() > 0) {
          this.systems[key]++;
          this._spendPoint();
          Game.render();
        }
      });

      bar.appendChild(minusBtn);
      bar.appendChild(pips);
      bar.appendChild(plusBtn);
      row.appendChild(bar);
      area.appendChild(row);
    }

    screen.appendChild(area);
    this._renderNavButtons(screen, null, 'captain', 'CAPTAIN →');
  },

  // ─── Phase 2: Captain ──────────────────────────────────────────

  _renderCaptain(screen) {
    this._renderPhaseHeader(screen, 'CAPTAIN', 'Invest in your captain\'s stats and choose one starting ability.');

    const area = document.createElement('div');
    area.style.cssText = 'width:100%; max-width:400px; overflow-y:auto; flex-shrink:1;';

    // Stats
    const statsHeader = document.createElement('div');
    statsHeader.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:var(--space-sm);';
    statsHeader.textContent = 'STATS';
    area.appendChild(statsHeader);

    for (const [key, info] of Object.entries(this.CAPTAIN_STAT_INFO)) {
      const val = this.captainStats[key];
      const row = document.createElement('div');
      row.className = 'alloc-category';

      const label = document.createElement('div');
      label.className = 'alloc-label';
      label.innerHTML = `${info.emoji} ${info.label} <span style="color:var(--text-accent);">${1 + val}</span>`;
      row.appendChild(label);

      const desc = document.createElement('div');
      desc.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-xs);';
      desc.textContent = info.desc;
      row.appendChild(desc);

      const controls = document.createElement('div');
      controls.className = 'alloc-controls';

      const minusBtn = document.createElement('button');
      minusBtn.className = 'alloc-btn';
      minusBtn.textContent = '−';
      minusBtn.addEventListener('click', () => {
        if (this.captainStats[key] > 0) {
          this.captainStats[key]--;
          this._refundPoint();
          Game.render();
        }
      });

      const value = document.createElement('span');
      value.className = 'alloc-value';
      value.textContent = val;

      const plusBtn = document.createElement('button');
      plusBtn.className = 'alloc-btn';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        if (this.captainStats[key] < 5 && this._getRemaining() > 0) {
          this.captainStats[key]++;
          this._spendPoint();
          Game.render();
        }
      });

      controls.appendChild(minusBtn);
      controls.appendChild(value);
      controls.appendChild(plusBtn);
      row.appendChild(controls);
      area.appendChild(row);
    }

    // Ability selection
    const abilityHeader = document.createElement('div');
    abilityHeader.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); text-transform:uppercase; letter-spacing:0.1em; margin:var(--space-md) 0 var(--space-sm);';
    abilityHeader.textContent = 'STARTING ABILITY (choose one)';
    area.appendChild(abilityHeader);

    for (const ability of this.CAPTAIN_ABILITIES) {
      const card = document.createElement('div');
      const selected = this.captainAbility === ability.id;
      card.style.cssText = `padding:var(--space-sm); margin-bottom:var(--space-sm); border:1px solid ${selected ? 'var(--text-accent)' : 'var(--border)'}; background:${selected ? 'var(--bg-tertiary)' : 'var(--bg-card)'}; cursor:pointer;`;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <span style="color:${selected ? 'var(--text-accent)' : 'var(--text-primary)'}; font-weight:bold;">${ability.name}</span>
          <span style="color:var(--text-muted); font-size:var(--font-size-sm);">${this.CAPTAIN_STAT_INFO[ability.stat].emoji} ${ability.stat}</span>
        </div>
        <div style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:var(--space-xs);">${ability.desc}</div>
      `;

      card.addEventListener('click', () => {
        this.captainAbility = ability.id;
        Game.render();
      });

      area.appendChild(card);
    }

    screen.appendChild(area);
    this._renderNavButtons(screen, 'systems', 'crew_pick', 'CREW →');
  },

  // ─── Phase 3: Crew Selection ───────────────────────────────────

  _renderCrewPick(screen) {
    const maxCrew = 2 + Math.floor((this.systems.crew_quarters || 0) / 2);
    this._renderPhaseHeader(screen, 'CREW ROSTER', `Pick up to ${maxCrew} starting crew. Each crew member costs 1 point.`);

    const area = document.createElement('div');
    area.style.cssText = 'width:100%; max-width:400px; overflow-y:auto; flex-shrink:1;';

    // Current crew picks
    if (this.crewChoices.length > 0) {
      const picked = document.createElement('div');
      picked.style.cssText = 'margin-bottom:var(--space-md);';
      const pickedLabel = document.createElement('div');
      pickedLabel.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); text-transform:uppercase; margin-bottom:var(--space-sm);';
      pickedLabel.textContent = `CREW (${this.crewChoices.length}/${maxCrew})`;
      picked.appendChild(pickedLabel);

      this.crewChoices.forEach((choice, idx) => {
        const ri = this.ROLE_INFO[choice.role] || {};
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:var(--space-sm); border:1px solid var(--border); margin-bottom:var(--space-xs); background:var(--bg-card);';
        row.innerHTML = `
          <span>${ri.emoji || '👤'} ${choice.role.toUpperCase()}</span>
        `;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'alloc-btn';
        removeBtn.style.cssText = 'min-width:32px; min-height:32px; color:var(--color-danger); border-color:var(--color-danger);';
        removeBtn.textContent = '✕';
        removeBtn.addEventListener('click', () => {
          this.crewChoices.splice(idx, 1);
          this._refundPoint();
          Game.render();
        });
        row.appendChild(removeBtn);
        picked.appendChild(row);
      });

      area.appendChild(picked);
    }

    // Available roles to add
    if (this.crewChoices.length < maxCrew) {
      const addLabel = document.createElement('div');
      addLabel.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); text-transform:uppercase; margin-bottom:var(--space-sm);';
      addLabel.textContent = 'ADD CREW MEMBER (1 pt each)';
      area.appendChild(addLabel);

      for (const role of this.CREW_ROLES) {
        const ri = this.ROLE_INFO[role];
        const card = document.createElement('div');
        const canAfford = this._getRemaining() > 0;
        card.style.cssText = `padding:var(--space-sm); margin-bottom:var(--space-sm); border:1px solid var(--border); background:var(--bg-card); cursor:${canAfford ? 'pointer' : 'default'}; ${canAfford ? '' : 'opacity:0.4;'}`;

        card.innerHTML = `
          <div style="display:flex; align-items:baseline; gap:var(--space-sm);">
            <span style="font-size:1.1rem;">${ri.emoji}</span>
            <span style="color:var(--text-primary); text-transform:uppercase;">${role}</span>
          </div>
          <div style="color:var(--text-muted); font-size:var(--font-size-sm); margin-top:2px;">${ri.desc}</div>
        `;

        if (canAfford) {
          card.addEventListener('click', () => {
            if (this.crewChoices.length < maxCrew && this._spendPoint()) {
              this.crewChoices.push({ role });
              Game.render();
            }
          });
        }

        area.appendChild(card);
      }
    }

    screen.appendChild(area);
    this._renderNavButtons(screen, 'captain', 'supplies', 'SUPPLIES →');
  },

  // ─── Phase 4: Supplies ─────────────────────────────────────────

  _renderSupplies(screen) {
    this._renderPhaseHeader(screen, 'STARTING SUPPLIES', 'Spend remaining points on credits and fuel.');

    const area = document.createElement('div');
    area.style.cssText = 'width:100%; max-width:400px;';

    const items = [
      { key: 'credits', label: 'CREDITS', emoji: '₢', desc: 'Buy weapons, modules, repairs, and crew at trade posts.', base: 50, perPoint: 30, unit: '₢' },
      { key: 'fuel', label: 'FUEL CELLS', emoji: '⛽', desc: 'Each jump costs 1 fuel. Run out and you drift.', base: 8, perPoint: 2, unit: '' },
    ];

    for (const item of items) {
      const val = this.supplies[item.key];
      const total = item.base + val * item.perPoint;
      const row = document.createElement('div');
      row.className = 'alloc-category';

      const label = document.createElement('div');
      label.className = 'alloc-label';
      label.innerHTML = `${item.emoji} ${item.label} <span style="color:var(--text-accent);">${item.unit}${total}</span>`;
      row.appendChild(label);

      const desc = document.createElement('div');
      desc.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-xs);';
      desc.textContent = `${item.desc} Base: ${item.unit}${item.base}, +${item.unit}${item.perPoint}/pt`;
      row.appendChild(desc);

      const controls = document.createElement('div');
      controls.className = 'alloc-controls';

      const minusBtn = document.createElement('button');
      minusBtn.className = 'alloc-btn';
      minusBtn.textContent = '−';
      minusBtn.addEventListener('click', () => {
        if (this.supplies[item.key] > 0) {
          this.supplies[item.key]--;
          this._refundPoint();
          Game.render();
        }
      });

      const value = document.createElement('span');
      value.className = 'alloc-value';
      value.textContent = val;

      const plusBtn = document.createElement('button');
      plusBtn.className = 'alloc-btn';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        if (this._getRemaining() > 0) {
          this.supplies[item.key]++;
          this._spendPoint();
          Game.render();
        }
      });

      controls.appendChild(minusBtn);
      controls.appendChild(value);
      controls.appendChild(plusBtn);
      row.appendChild(controls);
      area.appendChild(row);
    }

    screen.appendChild(area);
    this._renderNavButtons(screen, 'crew_pick', 'weapon_select', 'WEAPON →');
  },

  // ─── Phase 5: Weapon Select ────────────────────────────────────

  _renderWeaponSelect(screen) {
    this._renderPhaseHeader(screen, 'STARTING WEAPON', 'Choose your primary weapon for this run.');

    // Get tier 1 weapons available via run_start_choice
    let startWeapons = Registry.getWeaponsBySource('run_start_choice');
    if (startWeapons.length === 0) {
      startWeapons = Registry.getWeaponsByTier(1);
    }

    // Also check tier 3 weapons gated by resonance on the reconstruction screen
    const reconWeapons = Registry.getWeaponsBySource('reconstruction_screen_resonance')
      .filter(w => Registry.checkGating(w.gating ? w.gating.requires : []));
    startWeapons = startWeapons.concat(reconWeapons);

    if (startWeapons.length === 0) {
      // No weapon data loaded — skip
      this.phase = 'confirm';
      Game.render();
      return;
    }

    const weaponArea = document.createElement('div');
    weaponArea.style.cssText = 'width:100%; max-width:400px; overflow-y:auto; flex-shrink:1;';

    const SHIELD_HINT = { ballistic: 'Partial vs shields', energy: 'Blocked by shields', missile: 'Bypasses shields', emp: 'Bypasses shields', nexus_energy: 'Bypasses shields' };

    for (const wpn of startWeapons) {
      const card = document.createElement('div');
      const isSelected = this.selectedWeaponId === wpn.id;
      card.style.cssText = `padding:var(--space-sm); margin-bottom:var(--space-sm); border:2px solid ${isSelected ? 'var(--text-accent)' : 'var(--border)'}; background:${isSelected ? 'var(--bg-tertiary)' : 'var(--bg-card)'}; cursor:pointer;`;

      const emoji = wpn.type === 'nexus_energy' ? '◈' : (wpn.emoji || '⚔');
      const ammoText = wpn.stats.ammo != null ? ` | AMMO ${wpn.stats.ammo}` : '';
      const chargeText = wpn.stats.special_charges > 0 ? ` | CHG ${wpn.stats.special_charges}` : '';
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <span style="font-weight:bold; color:${isSelected ? 'var(--text-accent)' : 'var(--text-primary)'};">${emoji} ${wpn.name}</span>
          <span style="color:var(--text-muted); font-size:var(--font-size-sm);">T${wpn.tier} ${wpn.type}</span>
        </div>
        <div style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:var(--space-xs);">DMG ${wpn.stats.damage} | SPD ${wpn.stats.speed_modifier >= 0 ? '+' : ''}${wpn.stats.speed_modifier} | RNG ${wpn.stats.range}${ammoText}${chargeText}</div>
        <div style="color:var(--text-muted); font-size:var(--font-size-sm);">${SHIELD_HINT[wpn.type] || ''}</div>
        <div style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:var(--space-xs); font-style:italic;">${wpn.flavor}</div>
      `;

      if (wpn.tier === 3) card.style.borderColor = isSelected ? 'var(--color-nexus)' : 'var(--color-nexus)';
      if (wpn.irremovable) card.innerHTML += '<div style="color:var(--color-warning); font-size:var(--font-size-sm);">[⬡] Irremovable once equipped</div>';

      card.addEventListener('click', () => {
        this.selectedWeaponId = wpn.id;
        Game.render();
      });

      weaponArea.appendChild(card);
    }

    screen.appendChild(weaponArea);
    this._renderNavButtons(screen, 'supplies', 'confirm', 'REVIEW →');
  },

  // ─── Phase 6: Confirm ──────────────────────────────────────────

  _renderConfirm(screen) {
    const hdr = document.createElement('div');
    hdr.style.cssText = 'text-align:center; margin-bottom:var(--space-lg); width:100%;';
    const unused = this._getRemaining();
    hdr.innerHTML = `
      <div class="section-header" style="border-bottom:none;">RECONSTRUCTION SUMMARY</div>
      ${unused > 0 ? `<div style="color:var(--color-warning); font-size:var(--font-size-sm);">${unused} unspent point${unused > 1 ? 's' : ''} — go back to allocate</div>` : ''}
    `;
    screen.appendChild(hdr);

    const area = document.createElement('div');
    area.style.cssText = 'width:100%; max-width:400px; overflow-y:auto; flex-shrink:1; font-size:var(--font-size-sm);';

    // Systems summary
    let systemLines = '';
    for (const [key, info] of Object.entries(this.SYSTEM_INFO)) {
      const lv = 1 + this.systems[key];
      systemLines += `<div style="display:flex; justify-content:space-between; padding:2px 0;"><span>${info.emoji} ${info.label}</span><span style="color:var(--text-accent);">Lv ${lv}</span></div>`;
    }
    area.innerHTML += `<div style="margin-bottom:var(--space-md);"><div style="color:var(--text-muted); text-transform:uppercase; margin-bottom:var(--space-xs);">Ship Systems</div>${systemLines}</div>`;

    // Captain summary
    let capLines = '';
    for (const [key, info] of Object.entries(this.CAPTAIN_STAT_INFO)) {
      capLines += `<div style="display:flex; justify-content:space-between; padding:2px 0;"><span>${info.emoji} ${info.label}</span><span style="color:var(--text-accent);">${1 + this.captainStats[key]}</span></div>`;
    }
    const abilName = this.captainAbility ? this.CAPTAIN_ABILITIES.find(a => a.id === this.captainAbility)?.name || 'None' : 'None';
    capLines += `<div style="display:flex; justify-content:space-between; padding:2px 0; margin-top:var(--space-xs);"><span>Ability</span><span style="color:var(--text-accent);">${abilName}</span></div>`;
    area.innerHTML += `<div style="margin-bottom:var(--space-md);"><div style="color:var(--text-muted); text-transform:uppercase; margin-bottom:var(--space-xs);">Captain</div>${capLines}</div>`;

    // Crew summary
    let crewLine = this.crewChoices.length > 0
      ? this.crewChoices.map(c => `${(this.ROLE_INFO[c.role]?.emoji || '')} ${c.role}`).join(', ')
      : 'None recruited';
    area.innerHTML += `<div style="margin-bottom:var(--space-md);"><div style="color:var(--text-muted); text-transform:uppercase; margin-bottom:var(--space-xs);">Crew (${this.crewChoices.length})</div><div>${crewLine}</div></div>`;

    // Supplies summary
    const credits = 50 + this.supplies.credits * 30;
    const fuel = 8 + this.supplies.fuel * 2;
    area.innerHTML += `<div style="margin-bottom:var(--space-md);"><div style="color:var(--text-muted); text-transform:uppercase; margin-bottom:var(--space-xs);">Supplies</div><div>₢${credits} credits, ${fuel} fuel</div></div>`;

    // Weapon summary
    if (this.selectedWeaponId) {
      const wpn = Registry.getWeapon(this.selectedWeaponId);
      if (wpn) {
        area.innerHTML += `<div><div style="color:var(--text-muted); text-transform:uppercase; margin-bottom:var(--space-xs);">Weapon</div><div>${wpn.emoji || '⚔'} ${wpn.name} (T${wpn.tier} ${wpn.type})</div></div>`;
      }
    }

    screen.appendChild(area);

    // Launch button
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex; gap:var(--space-sm); width:100%; max-width:400px; margin-top:var(--space-lg);';

    const back = document.createElement('button');
    back.className = 'btn-confirm';
    back.style.cssText = 'flex:1; border-color:var(--border); color:var(--text-secondary);';
    back.textContent = '← BACK';
    back.addEventListener('click', () => { this.phase = 'weapon_select'; Game.render(); });

    const launch = document.createElement('button');
    launch.className = 'btn-confirm';
    launch.style.cssText = 'flex:2; background:var(--bg-tertiary);';
    launch.textContent = '▶ LAUNCH VESSEL';
    launch.addEventListener('click', () => this._confirmAllocation());

    nav.appendChild(back);
    nav.appendChild(launch);
    screen.appendChild(nav);
  },

  // ─── Apply Allocation ──────────────────────────────────────────

  _confirmAllocation() {
    const ship = GameState.run.ship;

    // Apply system levels
    for (const key of Object.keys(this.systems)) {
      if (ship.baseSystems[key]) {
        ship.baseSystems[key].level = 1 + this.systems[key];
      }
    }

    // Hull scales with shields_armor
    ship.hull = 60 + this.systems.shields_armor * 10 + this.systems.cargo_hold * 5;
    ship.maxHull = ship.hull;

    // Equip starting weapon
    if (this.selectedWeaponId) {
      ShipEngine.equipWeapon(this.selectedWeaponId);
    }

    // Apply captain stats
    const cap = GameState.run.captain;
    cap.stats.command = 1 + this.captainStats.command;
    cap.stats.intuition = 1 + this.captainStats.intuition;
    cap.stats.resolve = 1 + this.captainStats.resolve;
    if (this.captainAbility) {
      cap.abilities = [this.captainAbility];
    }

    // Generate crew from picks
    const crew = [];
    for (const choice of this.crewChoices) {
      crew.push(CrewEngine._createFromArchetype(choice.role, 0));
    }
    GameState.run.crew = crew;

    // Apply supplies
    GameState.run.credits = 50 + this.supplies.credits * 30;
    GameState.run.fuel = 8 + this.supplies.fuel * 2;

    // Generate map
    GameState.run.map = MapGenerator.generate();
    GameState.run.currentNodeId = GameState.run.map.startNodeId;
    GameState.run.depth = 0;

    // Reveal starting area
    const startNode = GameState.run.map.nodes.find(n => n.id === GameState.run.map.startNodeId);
    if (startNode) {
      startNode.visited = true;
      startNode.revealed = true;
      for (const edge of GameState.run.map.edges) {
        if (edge.from === startNode.id) {
          const target = GameState.run.map.nodes.find(n => n.id === edge.to);
          if (target) target.revealed = true;
        }
      }
    }

    GameState.addLog('system', 'The Nexus reconstructs. A new voyage begins.');
    GameState.screen = 'map';
    GameState.save();
    Tabs.activeTab = 'event';
    Game.render();
  },
};
