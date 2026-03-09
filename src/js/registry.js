/* Void Meridian — Content Registry */

const Registry = {
  weapons: new Map(),
  modules: new Map(),
  crew: new Map(),
  enemies: new Map(),
  factions: new Map(),

  // Event library (loaded from events_master.json format)
  eventLibrary: [],
  eventIndex: {},
  eventsByType: {},

  // ─── Loading ────────────────────────────────────────────────

  loadAll() {
    this._loadMap('weapons',  typeof DATA_WEAPONS  !== 'undefined' ? DATA_WEAPONS  : []);
    this._loadMap('modules',  typeof DATA_MODULES  !== 'undefined' ? DATA_MODULES  : []);
    this._loadMap('crew',     typeof DATA_CREW     !== 'undefined' ? DATA_CREW     : []);
    this._loadMap('enemies',  typeof DATA_ENEMIES  !== 'undefined' ? DATA_ENEMIES  : []);
    this._loadMap('factions', typeof DATA_FACTIONS  !== 'undefined' ? DATA_FACTIONS : []);
    this._loadEventLibrary();
    console.log(`Registry loaded: ${this.weapons.size} weapons, ${this.modules.size} modules, ${this.crew.size} crew, ${this.eventLibrary.length} events, ${this.enemies.size} enemies, ${this.factions.size} factions`);
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

  getWeapon(id)  { return this.weapons.get(id) || null; },
  getModule(id)  { return this.modules.get(id) || null; },
  getCrew(id)    { return this.crew.get(id) || null; },
  getEvent(id)   { return this.eventIndex[id] || null; },
  getEnemy(id)   { return this.enemies.get(id) || null; },
  getFaction(id) { return this.factions.get(id) || null; },

  getAllWeapons()  { return [...this.weapons.values()]; },
  getAllModules()  { return [...this.modules.values()]; },
  getAllCrew()     { return [...this.crew.values()]; },
  getAllEvents()   { return this.eventLibrary; },
  getAllEnemies()  { return [...this.enemies.values()]; },
  getAllFactions() { return [...this.factions.values()]; },

  // ─── Event Selection ──────────────────────────────────────────

  getEligibleEvents(nodeType, factionContext) {
    const candidates = this.eventsByType[nodeType] || [];
    const run = GameState.run;
    const meta = GameState.meta;
    const maxDepth = run.map ? run.map.maxDepth : 30;
    const depthZone = this._getDepthZone(run.depth, maxDepth);

    return candidates.filter(evt => {
      // 1. faction_context must match
      if (evt.faction_context && evt.faction_context !== 'none') {
        if (evt.faction_context !== (factionContext || 'none')) return false;
      }

      // 2. depth_zone must match
      if (evt.depth_zone && evt.depth_zone !== 'any') {
        if (evt.depth_zone !== depthZone) return false;
      }

      // 3. min_resonance gate
      if ((evt.min_resonance || 0) > meta.resonance) return false;

      // 4. Not already seen this run
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
