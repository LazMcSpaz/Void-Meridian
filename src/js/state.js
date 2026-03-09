/* Void Meridian — Game State Model */

const SAVE_KEY = 'void_meridian_v1';

// ─── Default Factories ──────────────────────────────────────────

function createMetaState() {
  return {
    resonance: 0,
    unlockedItems: [],
    milestoneFlags: [],
    runHistory: [],
    crewGraveyard: [],
    namedCrewState: {},   // { [id]: { encountered, secret_revealed } }
    trueEndingReached: false,
    totalRuns: 0,
  };
}

function createShipState() {
  return {
    hull: 100,
    maxHull: 100,
    visualStage: 1,
    baseSystems: {
      weapons:       { level: 1, maxLevel: 5, damaged: false },
      propulsion:    { level: 1, maxLevel: 5, damaged: false },
      sensors:       { level: 1, maxLevel: 5, damaged: false },
      shields_armor: { level: 1, maxLevel: 5, damaged: false },
      cargo_hold:    { level: 1, maxLevel: 5, damaged: false },
      crew_quarters: { level: 1, maxLevel: 5, damaged: false },
    },
    equippedWeapons: [],    // weapon instances from vm_weapons format
    equippedModules: [],    // module instances from vm_modules format
    cargo: [],
    nexusIntegrations: [],
  };
}

function createCaptainState() {
  return {
    abilities: [],
    stats: {
      command: 1,
      intuition: 1,
      resolve: 1,
    },
  };
}

function createFactionReputation() {
  return {
    concord_assembly: 0,    // -3 to +3
    vreth_dominion: 0,
    drifter_compact: 0,
    remnant_collective: 0,
  };
}

function createRunState() {
  return {
    active: false,
    ship: createShipState(),
    crew: [],
    captain: createCaptainState(),
    map: null,
    factions: createFactionReputation(),
    credits: 0,
    fuel: 10,
    depth: 0,
    runFlags: [],
    seenEventIds: [],
    log: [],
    currentNodeId: null,
    activeEvent: null,
    activeEventStep: 0,
    lastStepOutcomes: {},
    activeCombat: null,
    atDepot: false,        // currently docked at a trade post
    depotNodeId: null,     // node id of current depot
  };
}

// ─── Game State (singleton) ─────────────────────────────────────

const GameState = {
  meta: createMetaState(),
  run: createRunState(),
  screen: 'title', // title | reconstruction | map | event | combat | trade | derelict | gameOver | ending

  // ─── Persistence ────────────────────────────────────────────

  save() {
    try {
      const data = {
        version: 1,
        meta: this.meta,
        run: this.run,
        screen: this.screen,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Save failed:', e);
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.version !== 1) return false;
      this.meta = { ...createMetaState(), ...data.meta };
      this.run = { ...createRunState(), ...data.run };
      this.screen = data.screen || 'title';
      return true;
    } catch (e) {
      console.warn('Load failed:', e);
      return false;
    }
  },

  clearSave() {
    localStorage.removeItem(SAVE_KEY);
  },

  // ─── Run Lifecycle ──────────────────────────────────────────

  startNewRun() {
    this.run = createRunState();
    this.run.active = true;
    this.meta.totalRuns++;
    this.screen = 'reconstruction';
  },

  endRun(deathCause) {
    this.run.active = false;
    const summary = {
      depth: this.run.depth,
      crewLost: this.run.log.filter(e => e.type === 'crew_death').length,
      creditsEarned: this.run.credits,
      cause: deathCause || 'unknown',
    };
    this.meta.runHistory.push(summary);

    // Move surviving crew to graveyard for potential resurrection
    for (const member of this.run.crew) {
      if (!member.dead) {
        this.meta.crewGraveyard.push({
          id: member.id,
          name: member.name,
          role: member.role,
          personality: member.personality,
          runDepth: this.run.depth,
        });
      }
    }

    this.save();
  },

  // ─── Log ────────────────────────────────────────────────────

  addLog(type, message, data) {
    this.run.log.push({
      type,
      message,
      depth: this.run.depth,
      timestamp: Date.now(),
      ...data,
    });
  },

  // ─── Helpers ────────────────────────────────────────────────

  getResonanceTier() {
    const r = this.meta.resonance;
    if (r >= 500) return 5;
    if (r >= 200) return 4;
    if (r >= 80)  return 3;
    if (r >= 30)  return 2;
    if (r >= 10)  return 1;
    return 0;
  },

  getSalvagePoints() {
    const base = 8;
    return base + this.getResonanceTier() * 2 + Math.min(this.meta.totalRuns, 4);
  },
};
