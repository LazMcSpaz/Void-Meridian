/* Void Meridian — Content Registry */

const Registry = {
  weapons: new Map(),
  modules: new Map(),
  crewArchetypes: new Map(),
  crewNamed: new Map(),
  enemies: new Map(),

  // Event library (loaded from events_master.json format)
  eventLibrary: [],
  eventIndex: {},
  eventsByType: {},

  // ─── Loading ────────────────────────────────────────────────

  loadAll() {
    this._loadMap('weapons', typeof DATA_VM_WEAPONS !== 'undefined' ? DATA_VM_WEAPONS : (typeof DATA_WEAPONS !== 'undefined' ? DATA_WEAPONS : []));
    this._loadMap('modules', typeof DATA_VM_MODULES !== 'undefined' ? DATA_VM_MODULES : (typeof DATA_MODULES !== 'undefined' ? DATA_MODULES : []));
    this._loadCrewData(typeof DATA_VM_CREW !== 'undefined' ? DATA_VM_CREW : (typeof DATA_CREW !== 'undefined' ? DATA_CREW : []));
    this._loadMap('enemies', typeof DATA_ENEMIES !== 'undefined' ? DATA_ENEMIES : []);
    this._loadEventLibrary();
    console.log(`Registry loaded: ${this.weapons.size} weapons, ${this.modules.size} modules, ${this.crewArchetypes.size} archetypes, ${this.crewNamed.size} named crew, ${this.eventLibrary.length} events, ${this.enemies.size} enemies`);
  },

  _loadMap(key, arr) {
    this[key].clear();
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (item && item.id) {
        this[key].set(item.id, item);
      }
    }
  },

  _loadCrewData(arr) {
    this.crewArchetypes.clear();
    this.crewNamed.clear();
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || !item.id) continue;
      // Named characters have a fixed name and first_encounter object
      if (item.first_encounter || (item.name && !item.name_pool)) {
        this.crewNamed.set(item.id, item);
      } else {
        this.crewArchetypes.set(item.id, item);
      }
    }
  },

  _loadEventLibrary() {
    this.eventLibrary = [];
    this.eventIndex = {};
    this.eventsByType = {};

    const master = typeof DATA_EVENTS_MASTER !== 'undefined' ? DATA_EVENTS_MASTER : null;
    if (!master) return;

    const events = master.events || [];
    this.eventLibrary = events;

    for (const evt of events) {
      this.eventIndex[evt.id] = evt;
      const type = evt.node_type;
      if (!this.eventsByType[type]) this.eventsByType[type] = [];
      this.eventsByType[type].push(evt);
    }
  },

  // ─── Lookups ────────────────────────────────────────────────

  getWeapon(id)   { return this.weapons.get(id) || null; },
  getModule(id)   { return this.modules.get(id) || null; },
  getCrew(id)     { return this.crewNamed.get(id) || this.crewArchetypes.get(id) || null; },
  getEvent(id)    { return this.eventIndex[id] || null; },
  getEnemy(id)    { return this.enemies.get(id) || null; },

  getAllWeapons()      { return [...this.weapons.values()]; },
  getAllModules()      { return [...this.modules.values()]; },
  getAllCrewNamed()    { return [...this.crewNamed.values()]; },
  getAllCrewArchetypes() { return [...this.crewArchetypes.values()]; },
  getAllEvents()       { return this.eventLibrary; },
  getAllEnemies()      { return [...this.enemies.values()]; },

  // ─── Tier / Source Queries ────────────────────────────────────

  getWeaponsByTier(tier)  { return this.getAllWeapons().filter(w => w.tier === tier); },
  getModulesByTier(tier)  { return this.getAllModules().filter(m => m.tier === tier); },

  getWeaponsBySource(sourceKey) {
    return this.getAllWeapons().filter(w => w.gating && w.gating.source && w.gating.source.includes(sourceKey));
  },

  getModulesBySource(sourceKey) {
    return this.getAllModules().filter(m => m.source && m.source.includes(sourceKey));
  },

  getArchetypeByRole(role) {
    for (const arch of this.crewArchetypes.values()) {
      if (arch.role === role) return arch;
    }
    return null;
  },

  // ─── Gating System ───────────────────────────────────────────

  checkGating(requires) {
    if (!requires || requires.length === 0) return true;

    for (const req of requires) {
      switch (req.type) {
        case 'resonance_total':
          if (GameState.meta.resonance < (req.minimum || 0)) return false;
          break;

        case 'faction_reputation': {
          const rep = GameState.run.factions[req.faction] || 0;
          if (rep < (req.minimum || 0)) return false;
          break;
        }

        case 'milestone_flag':
          if (!GameState.meta.milestoneFlags.includes(req.flag)) return false;
          break;
      }
    }

    return true;
  },

  // ─── Event Selection ──────────────────────────────────────────

  getEligibleEvents(nodeType, factionContext) {
    const candidates = this.eventsByType[nodeType] || [];
    const run = GameState.run;
    const meta = GameState.meta;
    const maxDepth = run.map ? run.map.maxDepth : 30;
    const depthZone = this._getDepthZone(run.depth, maxDepth);

    return candidates.filter(evt => {
      if (evt.faction_context && evt.faction_context !== 'none') {
        if (evt.faction_context !== (factionContext || 'none')) return false;
      }
      if (evt.depth_zone && evt.depth_zone !== 'any') {
        if (evt.depth_zone !== depthZone) return false;
      }
      if ((evt.min_resonance || 0) > meta.resonance) return false;
      if (run.seenEventIds && run.seenEventIds.includes(evt.id)) return false;
      return true;
    });
  },

  _getDepthZone(depth, maxDepth) {
    const third = maxDepth / 3;
    if (depth <= third) return 'early';
    if (depth <= third * 2) return 'mid';
    return 'late';
  },
};
