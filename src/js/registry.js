/* Void Meridian — Content Registry */

const Registry = {
  weapons: new Map(),
  modules: new Map(),
  crew: new Map(),
  events: new Map(),
  enemies: new Map(),
  factions: new Map(),

  // ─── Loading ────────────────────────────────────────────────

  loadAll() {
    this._loadMap('weapons',  typeof DATA_WEAPONS  !== 'undefined' ? DATA_WEAPONS  : []);
    this._loadMap('modules',  typeof DATA_MODULES  !== 'undefined' ? DATA_MODULES  : []);
    this._loadMap('crew',     typeof DATA_CREW     !== 'undefined' ? DATA_CREW     : []);
    this._loadMap('events',   typeof DATA_EVENTS   !== 'undefined' ? DATA_EVENTS   : []);
    this._loadMap('enemies',  typeof DATA_ENEMIES  !== 'undefined' ? DATA_ENEMIES  : []);
    this._loadMap('factions', typeof DATA_FACTIONS  !== 'undefined' ? DATA_FACTIONS : []);
    console.log(`Registry loaded: ${this.weapons.size} weapons, ${this.modules.size} modules, ${this.crew.size} crew, ${this.events.size} events, ${this.enemies.size} enemies, ${this.factions.size} factions`);
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

  // ─── Lookups ────────────────────────────────────────────────

  getWeapon(id)  { return this.weapons.get(id) || null; },
  getModule(id)  { return this.modules.get(id) || null; },
  getCrew(id)    { return this.crew.get(id) || null; },
  getEvent(id)   { return this.events.get(id) || null; },
  getEnemy(id)   { return this.enemies.get(id) || null; },
  getFaction(id) { return this.factions.get(id) || null; },

  getAllWeapons()  { return [...this.weapons.values()]; },
  getAllModules()  { return [...this.modules.values()]; },
  getAllCrew()     { return [...this.crew.values()]; },
  getAllEvents()   { return [...this.events.values()]; },
  getAllEnemies()  { return [...this.enemies.values()]; },
  getAllFactions() { return [...this.factions.values()]; },

  // ─── Context-Aware Event Filtering ──────────────────────────

  getEligibleEvents(context) {
    const results = [];
    for (const evt of this.events.values()) {
      if (this._eventMatchesContext(evt, context)) {
        results.push(evt);
      }
    }
    return results;
  },

  _eventMatchesContext(evt, ctx) {
    // Must match node type
    if (evt.nodeType && evt.nodeType !== ctx.nodeType) return false;

    if (!evt.triggers) return true;
    const triggers = evt.triggers;

    // Check conditions
    if (triggers.conditions) {
      for (const cond of triggers.conditions) {
        if (!this._checkCondition(cond, ctx)) return false;
      }
    }

    return true;
  },

  _checkCondition(cond, ctx) {
    switch (cond.type) {
      case 'hasFlag':
        return ctx.runFlags && ctx.runFlags.includes(cond.flag);
      case 'notFlag':
        return !ctx.runFlags || !ctx.runFlags.includes(cond.flag);
      case 'minCrew':
        return ctx.crewCount >= (cond.value || 1);
      case 'maxCrew':
        return ctx.crewCount <= (cond.value || 99);
      case 'hasRole':
        return ctx.crewRoles && ctx.crewRoles.includes(cond.role);
      case 'factionRep': {
        const rep = ctx.factionReps ? (ctx.factionReps[cond.faction] || 0) : 0;
        if (cond.min !== undefined && rep < cond.min) return false;
        if (cond.max !== undefined && rep > cond.max) return false;
        return true;
      }
      case 'minDepth':
        return ctx.depth >= (cond.value || 0);
      case 'maxDepth':
        return ctx.depth <= (cond.value || 999);
      case 'hullBelow':
        return ctx.hullPercent < (cond.value || 100);
      case 'hullAbove':
        return ctx.hullPercent > (cond.value || 0);
      case 'minResonance':
        return ctx.resonance >= (cond.value || 0);
      default:
        return true;
    }
  },

  // ─── Build Event Context from GameState ─────────────────────

  buildEventContext(nodeType) {
    const run = GameState.run;
    return {
      nodeType,
      runFlags: run.runFlags,
      crewCount: run.crew.filter(c => !c.dead).length,
      crewRoles: run.crew.filter(c => !c.dead).map(c => c.role),
      factionReps: run.factions,
      depth: run.depth,
      hullPercent: run.ship.maxHull > 0 ? (run.ship.hull / run.ship.maxHull) * 100 : 100,
      resonance: GameState.meta.resonance,
      credits: run.credits,
      fuel: run.fuel,
    };
  },
};
