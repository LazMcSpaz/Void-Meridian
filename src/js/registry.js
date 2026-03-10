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
    // Merge both data sources — vm_ files take priority, base files fill gaps
    this._loadMerged('weapons',
      typeof DATA_VM_WEAPONS !== 'undefined' ? DATA_VM_WEAPONS : [],
      typeof DATA_WEAPONS !== 'undefined' ? DATA_WEAPONS : []);
    this._loadMerged('modules',
      typeof DATA_VM_MODULES !== 'undefined' ? DATA_VM_MODULES : [],
      typeof DATA_MODULES !== 'undefined' ? DATA_MODULES : []);
    this._loadCrewData(this._mergeArrays(
      typeof DATA_VM_CREW !== 'undefined' ? DATA_VM_CREW : [],
      typeof DATA_CREW !== 'undefined' ? DATA_CREW : []));
    this._loadMap('enemies', typeof DATA_ENEMIES !== 'undefined' ? DATA_ENEMIES : []);

    // If no weapons loaded from data files, use built-in starter set
    if (this.weapons.size === 0) this._loadFallbackWeapons();
    if (this.modules.size === 0) this._loadFallbackModules();

    this._loadEventLibrary();

    // Initialize crew interaction system
    if (typeof InteractionEngine !== 'undefined' && typeof DATA_CREW_INTERACTIONS !== 'undefined') {
      InteractionEngine.init(DATA_CREW_INTERACTIONS);
    }

    const intCount = typeof InteractionEngine !== 'undefined' ? InteractionEngine._interactionLibrary.length : 0;
    console.log(`Registry loaded: ${this.weapons.size} weapons, ${this.modules.size} modules, ${this.crewArchetypes.size} archetypes, ${this.crewNamed.size} named crew, ${this.eventLibrary.length} events, ${intCount} interactions, ${this.enemies.size} enemies`);
  },

  _mergeArrays(primary, secondary) {
    if (!Array.isArray(primary)) primary = [];
    if (!Array.isArray(secondary)) secondary = [];
    const seen = new Set(primary.filter(i => i && i.id).map(i => i.id));
    const merged = [...primary];
    for (const item of secondary) {
      if (item && item.id && !seen.has(item.id)) merged.push(item);
    }
    return merged;
  },

  _loadMerged(key, primary, secondary) {
    this[key].clear();
    const merged = this._mergeArrays(primary, secondary);
    for (const item of merged) {
      if (item && item.id) this[key].set(item.id, item);
    }
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
      // Event-level flag gating — all required flags must be present
      if (evt.requires_flags && evt.requires_flags.length > 0) {
        if (!evt.requires_flags.every(f => run.runFlags.includes(f))) return false;
      }
      // Repeatable events skip the seenEventIds check
      if (!evt.repeatable && run.seenEventIds && run.seenEventIds.includes(evt.id)) return false;
      return true;
    });
  },

  _getDepthZone(depth, maxDepth) {
    const third = maxDepth / 3;
    if (depth <= third) return 'early';
    if (depth <= third * 2) return 'mid';
    return 'late';
  },

  // ─── Fallback Data (used when no JSON data files are loaded) ───

  _loadFallbackWeapons() {
    const weapons = [
      { id: 'wpn_pulse_cannon', name: 'Pulse Cannon', type: 'energy', tier: 1, emoji: '⚡',
        stats: { damage: 8, speed_modifier: 0, range: 2, ammo: null, special_charges: 0 },
        flavor: 'Standard-issue energy projector. Reliable if unexciting.',
        gating: { source: ['run_start_choice'] }, irremovable: false },
      { id: 'wpn_autocannon', name: 'Autocannon', type: 'ballistic', tier: 1, emoji: '🔫',
        stats: { damage: 10, speed_modifier: -1, range: 2, ammo: 30, special_charges: 0 },
        flavor: 'Kinetic slugs shred hull plating. Mind the ammo.',
        gating: { source: ['run_start_choice'] }, irremovable: false },
      { id: 'wpn_missile_pod', name: 'Missile Pod', type: 'missile', tier: 1, emoji: '🚀',
        stats: { damage: 14, speed_modifier: -2, range: 3, ammo: 8, special_charges: 0 },
        flavor: 'Lock-on warheads that bypass shields. Limited payload.',
        gating: { source: ['run_start_choice'] }, irremovable: false },
      { id: 'wpn_emp_lance', name: 'EMP Lance', type: 'emp', tier: 1, emoji: '⚡',
        stats: { damage: 5, speed_modifier: 1, range: 3, ammo: null, special_charges: 2 },
        flavor: 'Disables enemy systems. Low damage, high utility.',
        gating: { source: ['run_start_choice'] }, irremovable: false },
      { id: 'wpn_scatter_laser', name: 'Scatter Laser', type: 'energy', tier: 2, emoji: '✦',
        stats: { damage: 12, speed_modifier: 0, range: 1, ammo: null, special_charges: 0 },
        flavor: 'Diffused beam tears through close targets.',
        gating: { source: ['trade_post', 'salvage'] }, irremovable: false },
      { id: 'wpn_railgun', name: 'Railgun', type: 'ballistic', tier: 2, emoji: '⟐',
        stats: { damage: 20, speed_modifier: -3, range: 4, ammo: 12, special_charges: 0 },
        flavor: 'Magnetic acceleration. One shot, one hole.',
        gating: { source: ['trade_post'] }, irremovable: false },
      { id: 'wpn_nexus_tendril', name: 'Nexus Tendril', type: 'nexus_energy', tier: 3, emoji: '◈',
        stats: { damage: 18, speed_modifier: 2, range: 2, ammo: null, special_charges: 3 },
        flavor: 'it grew from the hull. it fires when you think about firing.',
        nexus_flavor: 'this is a gift. do not question what it costs.',
        gating: { source: ['reconstruction_screen_resonance'], requires: [{ type: 'resonance_total', minimum: 80 }] },
        irremovable: true },
    ];
    for (const w of weapons) this.weapons.set(w.id, w);
  },

  _loadFallbackModules() {
    const modules = [
      { id: 'mod_hull_patch', name: 'Hull Patch Kit', slots_onto: 'cargo_hold', tier: 1,
        effect: 'Restores 10 Hull when used at a station.', station_action: 'repair_10',
        flavor: 'Sealant, prayer, and duct tape.', irremovable: false },
      { id: 'mod_scanner_array', name: 'Scanner Array', slots_onto: 'sensors', tier: 1,
        effect: 'Reveals adjacent nodes on the map.', crew_synergy: 'scientist',
        flavor: 'See further. Know more. Fear everything.', irremovable: false },
      { id: 'mod_reinforced_bulkhead', name: 'Reinforced Bulkhead', slots_onto: 'shields_armor', tier: 1,
        effect: '+15 Max Hull.', flavor: 'Extra plating welded over the weak points.', irremovable: false },
      { id: 'mod_fuel_recycler', name: 'Fuel Recycler', slots_onto: 'propulsion', tier: 1,
        effect: '15% chance to not consume fuel on jump.',
        flavor: 'Reclaims trace elements from exhaust.', irremovable: false },
      { id: 'mod_targeting_computer', name: 'Targeting Computer', slots_onto: 'weapons', tier: 2,
        effect: '+2 damage to all equipped weapons.', crew_synergy: 'soldier',
        flavor: 'It does the math so you can do the violence.', irremovable: false },
      { id: 'mod_med_bay', name: 'Med Bay', slots_onto: 'crew_quarters', tier: 1,
        effect: 'Crew heal conditions 1 node faster. +5 morale on recruit.',
        flavor: 'Clean beds and better drugs.', irremovable: false },
      { id: 'mod_nexus_cortex', name: 'Nexus Cortex', slots_onto: 'sensors', tier: 3,
        effect: 'Generates 2 Resonance per node. Reveals Nexus Anomaly nodes.',
        flavor: 'it sees what you see. it remembers what you forget.',
        nexus_integrated: true, irremovable: true,
        gating_requires: [{ type: 'resonance_total', minimum: 50 }] },
    ];
    for (const m of modules) this.modules.set(m.id, m);
  },
};
