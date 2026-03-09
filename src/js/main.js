/* Void Meridian — Main Entry Point & Game Loop */

const Game = {
  init() {
    // Load content registry
    Registry.loadAll();

    // Attempt to load saved game
    const loaded = GameState.load();
    if (!loaded) {
      GameState.screen = 'title';
    }

    // Always show title on fresh page load so player can choose Continue or Restart
    if (GameState.run.active) {
      GameState.screen = 'title';
    }

    // If we loaded into a run that was on the reconstruction screen, restart it
    if (GameState.screen === 'reconstruction') {
      ReconstructionUI.phase = 'allocation';
    }

    this.render();
  },

  render() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    switch (GameState.screen) {
      case 'title':
        this._renderTitle(app);
        break;
      case 'reconstruction':
        ReconstructionUI.render(app);
        break;
      case 'map':
      case 'event':
      case 'combat':
        this._renderRunScreen(app);
        break;
      case 'gameOver':
        this._renderGameOver(app);
        break;
      case 'ending':
        this._renderEnding(app);
        break;
      default:
        this._renderTitle(app);
    }
  },

  _renderTitle(app) {
    const screen = document.createElement('div');
    screen.className = 'fullscreen title-screen';

    screen.innerHTML = `
      <div class="game-title">VOID MERIDIAN</div>
      <div class="game-subtitle">A roguelike in the space between deaths</div>
    `;

    // New Game button
    const newBtn = document.createElement('button');
    newBtn.className = 'btn-confirm';
    newBtn.style.cssText = 'max-width:300px; margin-bottom:var(--space-md);';
    newBtn.textContent = 'NEW VOYAGE';
    newBtn.addEventListener('click', () => {
      GameState.startNewRun();
      ReconstructionUI.start();
    });
    screen.appendChild(newBtn);

    // Continue button (if save exists)
    if (GameState.run.active) {
      const contBtn = document.createElement('button');
      contBtn.className = 'btn-confirm';
      contBtn.style.cssText = 'max-width:300px; margin-bottom:var(--space-md);';
      contBtn.textContent = 'CONTINUE';
      contBtn.addEventListener('click', () => {
        GameState.screen = 'map';
        this.render();
      });
      screen.appendChild(contBtn);
    }

    // Resonance display
    if (GameState.meta.resonance > 0) {
      const res = document.createElement('div');
      res.style.cssText = 'margin-top:var(--space-xl); color:var(--color-nexus); font-size:var(--font-size-sm);';
      res.textContent = `RESONANCE: ${GameState.meta.resonance}`;
      screen.appendChild(res);
    }

    // Run count
    if (GameState.meta.totalRuns > 0) {
      const runs = document.createElement('div');
      runs.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); margin-top:var(--space-sm);';
      runs.textContent = `Voyages: ${GameState.meta.totalRuns}`;
      screen.appendChild(runs);
    }

    app.appendChild(screen);
  },

  _renderRunScreen(app) {
    // Header bar with resources
    const header = document.createElement('div');
    header.className = 'header-bar';
    header.innerHTML = `
      <span class="resource">◈ S${GameState.run.depth}</span>
      <span class="resource">HULL <span class="resource-value">${GameState.run.ship.hull}/${GameState.run.ship.maxHull}</span></span>
      <span class="resource">₢<span class="resource-value">${GameState.run.credits}</span></span>
      <span class="resource">⛽<span class="resource-value">${GameState.run.fuel}</span></span>
    `;
    app.appendChild(header);

    // Active screen content
    if (GameState.screen === 'combat' && GameState.run.activeCombat) {
      CombatUI.render(app);
    } else {
      // Tab content
      const contentArea = document.createElement('div');
      contentArea.style.cssText = 'flex:1; display:flex; flex-direction:column; overflow:hidden;';

      switch (Tabs.activeTab) {
        case 'map':
          MapUI.render(contentArea);
          break;
        case 'event':
          // Show depot menu when docked and no active event
          if (GameState.run.atDepot && !GameState.run.activeEvent) {
            DepotUI.render(contentArea);
          } else {
            EventUI.render(contentArea);
          }
          break;
        case 'crew':
          CrewUI.render(contentArea);
          break;
        case 'log':
          LogUI.render(contentArea);
          break;
      }

      app.appendChild(contentArea);
    }

    // Tab bar
    Tabs.render(app);
    Tabs.setVisible(GameState.screen !== 'combat');
  },

  _renderGameOver(app) {
    const screen = document.createElement('div');
    screen.className = 'fullscreen';
    screen.innerHTML = `
      <div style="text-align:center;">
        <div style="font-size:var(--font-size-xl); color:var(--color-danger); margin-bottom:var(--space-md);">VESSEL LOST</div>
        <div style="color:var(--text-secondary); margin-bottom:var(--space-lg);">The Meridian is gone. But the Nexus remembers.</div>
      </div>
    `;

    const btn = document.createElement('button');
    btn.className = 'btn-confirm';
    btn.style.maxWidth = '300px';
    btn.textContent = 'RECONSTRUCTION';
    btn.addEventListener('click', () => {
      const gained = NexusEngine.accumulateRunResonance();
      GameState.startNewRun();
      ReconstructionUI.start();
    });
    screen.appendChild(btn);
    app.appendChild(screen);
  },

  _renderEnding(app) {
    const screen = document.createElement('div');
    screen.className = 'fullscreen';

    if (NexusEngine.checkTrueEnding()) {
      screen.innerHTML = `
        <div style="text-align:center; max-width:80vw;">
          <div style="font-size:var(--font-size-xl); color:var(--color-nexus); margin-bottom:var(--space-lg);">THE WOUND CLOSES</div>
          <div style="color:var(--text-secondary); line-height:1.8;">
            The Nexus falls silent for the first time. The pattern is complete.<br><br>
            You are free. Or perhaps you always were.
          </div>
        </div>
      `;
    } else {
      screen.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:var(--font-size-xl); color:var(--text-accent);">TO BE CONTINUED</div>
        </div>
      `;
    }

    const btn = document.createElement('button');
    btn.className = 'btn-confirm';
    btn.style.cssText = 'max-width:300px; margin-top:var(--space-xl);';
    btn.textContent = 'RETURN TO TITLE';
    btn.addEventListener('click', () => {
      GameState.screen = 'title';
      this.render();
    });
    screen.appendChild(btn);
    app.appendChild(screen);
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => Game.init());
