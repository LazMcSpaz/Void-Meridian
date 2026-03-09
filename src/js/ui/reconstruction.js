/* Void Meridian — Reconstruction Screen */

const ReconstructionUI = {
  phase: 'recap',  // recap | transmission | allocation | weapon_select
  allocation: { ship: 0, captain: 0, crew: 0, cargo: 0 },
  selectedWeaponId: null,
  recapLineIndex: 0,
  recapTimer: null,

  render(container) {
    const screen = document.createElement('div');
    screen.className = 'fullscreen recon-screen';

    switch (this.phase) {
      case 'recap':
        this._renderRecap(screen);
        break;
      case 'transmission':
        this._renderTransmission(screen);
        break;
      case 'allocation':
        this._renderAllocation(screen);
        break;
      case 'weapon_select':
        this._renderWeaponSelect(screen);
        break;
    }

    container.appendChild(screen);
  },

  start() {
    this.phase = 'recap';
    this.allocation = { ship: 0, captain: 0, crew: 0, cargo: 0 };
    this.selectedWeaponId = null;
    this.recapLineIndex = 0;
    Game.render();
    this._startRecapAnimation();
  },

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
      this.phase = 'allocation';
      Game.render();
    }, 3500);
  },

  _renderAllocation(screen) {
    const points = GameState.getSalvagePoints();
    const spent = this.allocation.ship + this.allocation.captain + this.allocation.crew + this.allocation.cargo;
    const remaining = points - spent;

    const title = document.createElement('div');
    title.className = 'section-header';
    title.style.cssText = 'text-align:center; margin-bottom:var(--space-lg);';
    title.textContent = `SALVAGE ALLOCATION — ${remaining} POINTS`;
    screen.appendChild(title);

    const categories = [
      { key: 'ship', label: 'SHIP SYSTEMS', desc: 'Hull, weapons, propulsion' },
      { key: 'captain', label: 'CAPTAIN ABILITIES', desc: 'Command, intuition, resolve' },
      { key: 'crew', label: 'CREW', desc: 'Starting crew quality & count' },
      { key: 'cargo', label: 'CARGO', desc: 'Starting credits & supplies' },
    ];

    const allocArea = document.createElement('div');
    allocArea.style.cssText = 'width:100%; max-width:400px;';

    for (const cat of categories) {
      const row = document.createElement('div');
      row.className = 'alloc-category';

      const label = document.createElement('div');
      label.className = 'alloc-label';
      label.innerHTML = `${cat.label} <span style="color:var(--text-muted); font-size:0.7rem;">${cat.desc}</span>`;
      row.appendChild(label);

      const controls = document.createElement('div');
      controls.className = 'alloc-controls';

      const minusBtn = document.createElement('button');
      minusBtn.className = 'alloc-btn';
      minusBtn.textContent = '−';
      minusBtn.addEventListener('click', () => {
        if (this.allocation[cat.key] > 0) {
          this.allocation[cat.key]--;
          Game.render();
        }
      });

      const value = document.createElement('span');
      value.className = 'alloc-value';
      value.textContent = this.allocation[cat.key];

      const plusBtn = document.createElement('button');
      plusBtn.className = 'alloc-btn';
      plusBtn.textContent = '+';
      plusBtn.addEventListener('click', () => {
        if (remaining > 0) {
          this.allocation[cat.key]++;
          Game.render();
        }
      });

      controls.appendChild(minusBtn);
      controls.appendChild(value);
      controls.appendChild(plusBtn);
      row.appendChild(controls);
      allocArea.appendChild(row);
    }

    screen.appendChild(allocArea);

    // Next: weapon selection
    const confirm = document.createElement('button');
    confirm.className = 'btn-confirm';
    confirm.textContent = 'CHOOSE WEAPON →';
    confirm.style.maxWidth = '400px';
    confirm.addEventListener('click', () => {
      this.phase = 'weapon_select';
      Game.render();
    });
    screen.appendChild(confirm);
  },

  _renderWeaponSelect(screen) {
    const title = document.createElement('div');
    title.className = 'section-header';
    title.style.cssText = 'text-align:center; margin-bottom:var(--space-lg);';
    title.textContent = 'SELECT STARTING WEAPON';
    screen.appendChild(title);

    // Get tier 1 weapons available via run_start_choice
    let startWeapons = Registry.getWeaponsBySource('run_start_choice');
    if (startWeapons.length === 0) {
      // Fallback: all tier 1 weapons
      startWeapons = Registry.getWeaponsByTier(1);
    }

    // Also check tier 3 weapons gated by resonance on the reconstruction screen
    const reconWeapons = Registry.getWeaponsBySource('reconstruction_screen_resonance')
      .filter(w => Registry.checkGating(w.gating ? w.gating.requires : []));
    startWeapons = startWeapons.concat(reconWeapons);

    if (startWeapons.length === 0) {
      // No weapon data loaded — skip weapon selection
      this._confirmAllocation();
      return;
    }

    const weaponArea = document.createElement('div');
    weaponArea.style.cssText = 'width:100%; max-width:400px;';

    for (const wpn of startWeapons) {
      const card = document.createElement('div');
      const isSelected = this.selectedWeaponId === wpn.id;
      card.className = 'crew-card' + (isSelected ? ' selected' : '');
      card.style.cssText = `cursor:pointer; border:2px solid ${isSelected ? 'var(--text-accent)' : 'var(--border)'}; margin-bottom:var(--space-sm); padding:var(--space-sm);`;

      const emoji = wpn.type === 'nexus_energy' ? '◈' : (wpn.emoji || '⚔');
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:baseline;">
          <span style="font-weight:bold;">${emoji} ${wpn.name}</span>
          <span style="color:var(--text-muted); font-size:var(--font-size-sm);">T${wpn.tier} ${wpn.type}</span>
        </div>
        <div style="color:var(--text-muted); font-size:var(--font-size-sm); margin-top:var(--space-xs);">DMG ${wpn.stats.damage} | SPD ${wpn.stats.speed_modifier >= 0 ? '+' : ''}${wpn.stats.speed_modifier} | RNG ${wpn.stats.range}</div>
        <div style="color:var(--text-secondary); font-size:var(--font-size-sm); margin-top:var(--space-xs); font-style:italic;">${wpn.flavor}</div>
      `;

      if (wpn.tier === 3) card.style.borderColor = 'var(--color-nexus)';

      card.addEventListener('click', () => {
        this.selectedWeaponId = wpn.id;
        Game.render();
      });

      weaponArea.appendChild(card);
    }

    screen.appendChild(weaponArea);

    // Confirm button
    const confirm = document.createElement('button');
    confirm.className = 'btn-confirm';
    confirm.textContent = 'CONFIRM RECONSTRUCTION';
    confirm.style.maxWidth = '400px';
    if (!this.selectedWeaponId) {
      confirm.style.opacity = '0.5';
    }
    confirm.addEventListener('click', () => {
      if (this.selectedWeaponId || startWeapons.length === 0) {
        this._confirmAllocation();
      }
    });
    screen.appendChild(confirm);
  },

  _confirmAllocation() {
    const alloc = this.allocation;

    // Apply ship allocation
    const ship = GameState.run.ship;
    ship.hull = 60 + alloc.ship * 8;
    ship.maxHull = ship.hull;
    ship.baseSystems.weapons.level = 1 + Math.floor(alloc.ship / 3);
    ship.baseSystems.propulsion.level = 1 + Math.floor(alloc.ship / 4);
    ship.baseSystems.shields_armor.level = 1 + Math.floor(alloc.ship / 4);

    // Equip starting weapon
    if (this.selectedWeaponId) {
      ShipEngine.equipWeapon(this.selectedWeaponId);
    }

    // Apply captain allocation
    const cap = GameState.run.captain;
    cap.stats.command = 1 + Math.floor(alloc.captain / 2);
    cap.stats.intuition = 1 + Math.floor(alloc.captain / 3);
    cap.stats.resolve = 1 + Math.floor(alloc.captain / 3);

    // Apply crew allocation — generate starter crew
    const crewCount = 2 + Math.floor(alloc.crew / 2);
    GameState.run.crew = CrewEngine.generateStarterCrew(crewCount, alloc.crew);

    // Apply cargo allocation
    GameState.run.credits = 50 + alloc.cargo * 25;
    GameState.run.fuel = 8 + Math.floor(alloc.cargo / 2);

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
