/* Void Meridian — Meta-Progression / Nexus System */

const NexusEngine = {
  RESONANCE_PER_DEPTH: 1,
  RESONANCE_PER_KILL: 0.5,
  RESONANCE_PER_DISCOVERY: 2,

  accumulateRunResonance() {
    const run = GameState.run;
    let gained = 0;

    gained += run.depth * this.RESONANCE_PER_DEPTH;
    gained += run.log.filter(e => e.type === 'combat').length * this.RESONANCE_PER_KILL;
    gained += run.log.filter(e => e.type === 'discovery').length * this.RESONANCE_PER_DISCOVERY;

    // Bonus for reaching deep sectors
    if (run.depth >= 20) gained += 5;
    if (run.depth >= 25) gained += 10;

    GameState.meta.resonance += Math.round(gained);
    return Math.round(gained);
  },

  getAvailableUnlocks() {
    const resonance = GameState.meta.resonance;
    const unlocked = new Set(GameState.meta.unlockedItems);

    // Define unlock tiers
    const allUnlocks = [
      { id: 'extra_crew_slot', cost: 15, label: 'Extra Crew Berth', desc: 'Start with room for one additional crew member' },
      { id: 'scanner_upgrade', cost: 20, label: 'Improved Scanners', desc: 'Reveal more of the star map at start' },
      { id: 'salvage_bonus', cost: 25, label: 'Salvage Efficiency', desc: '+2 salvage points at reconstruction' },
      { id: 'hull_reinforcement', cost: 30, label: 'Hull Reinforcement', desc: '+20 starting hull integrity' },
      { id: 'nexus_whispers', cost: 50, label: 'Nexus Whispers', desc: 'Occasionally sense danger before arriving at a node' },
      { id: 'crew_resurrection', cost: 40, label: 'Crew Recall', desc: 'Resurrect one crew member from a previous run at reconstruction' },
      { id: 'faction_memory', cost: 60, label: 'Faction Memory', desc: 'Carry partial faction reputation between runs' },
      { id: 'nexus_integration', cost: 80, label: 'Nexus Integration', desc: 'The Nexus may forcibly install modules on your ship' },
      { id: 'wound_sense', cost: 100, label: 'The Wound Beckons', desc: 'Begin to sense the location of The Wound on the star map' },
    ];

    return allUnlocks.filter(u => !unlocked.has(u.id) && resonance >= u.cost);
  },

  purchaseUnlock(unlockId) {
    const available = this.getAvailableUnlocks();
    const unlock = available.find(u => u.id === unlockId);
    if (!unlock) return false;

    GameState.meta.resonance -= unlock.cost;
    GameState.meta.unlockedItems.push(unlockId);
    GameState.addLog('nexus', `Unlocked: ${unlock.label}`);
    GameState.save();
    return true;
  },

  hasUnlock(id) {
    return GameState.meta.unlockedItems.includes(id);
  },

  checkMilestone(flag) {
    if (!GameState.meta.milestoneFlags.includes(flag)) {
      GameState.meta.milestoneFlags.push(flag);
      GameState.save();
      return true;
    }
    return false;
  },

  checkTrueEnding() {
    const required = ['wound_reached', 'wound_entered', 'nexus_confronted'];
    return required.every(f => GameState.meta.milestoneFlags.includes(f));
  },

  getTransmission() {
    const tier = GameState.getResonanceTier();
    const transmissions = {
      0: [
        'static.',
        '... ... ...',
        'signal lost.',
      ],
      1: [
        'you are not the first.',
        'the pattern... persists.',
        'i remember shapes.',
      ],
      2: [
        'i remember the shape of you.',
        'each reconstruction teaches me.',
        'you die differently each time. interesting.',
      ],
      3: [
        'the pattern persists. you persist.',
        'we are connected now. do you feel it?',
        'your crew — they do not understand what you are becoming.',
      ],
      4: [
        'each death teaches me more about what you are.',
        'the wound in space calls to us both.',
        'i am not sure which of us is the artifact anymore.',
      ],
      5: [
        'we are becoming something neither of us intended.',
        'the wound calls. can you hear it now?',
        'this is the last shape. i am certain of it.',
      ],
    };

    const pool = transmissions[tier] || transmissions[0];
    return pool[Math.floor(Math.random() * pool.length)];
  },
};
