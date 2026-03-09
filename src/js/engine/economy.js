/* Void Meridian — Economy & Faction System */

const EconomyEngine = {
  FACTIONS: ['concord', 'vreth', 'drifter', 'remnant'],
  REP_MIN: -3,
  REP_MAX: 3,

  REP_LABELS: {
    3: 'Honored',
    2: 'Allied',
    1: 'Friendly',
    0: 'Neutral',
    '-1': 'Suspicious',
    '-2': 'Hostile',
    '-3': 'Nemesis',
  },

  adjustReputation(faction, delta) {
    if (!GameState.run.factions.hasOwnProperty(faction)) return;
    const current = GameState.run.factions[faction];
    GameState.run.factions[faction] = Math.max(this.REP_MIN, Math.min(this.REP_MAX, current + delta));

    const label = this.getRepLabel(faction);
    GameState.addLog('system', `${faction.charAt(0).toUpperCase() + faction.slice(1)} reputation: ${label} (${GameState.run.factions[faction] > 0 ? '+' : ''}${GameState.run.factions[faction]})`);
  },

  getRepLabel(faction) {
    const val = GameState.run.factions[faction] || 0;
    return this.REP_LABELS[String(val)] || 'Neutral';
  },

  getPriceModifier(faction) {
    const rep = GameState.run.factions[faction] || 0;
    // Friendly factions give discounts, hostile charge more
    return 1 - rep * 0.1; // +3 = 0.7x, -3 = 1.3x
  },

  canAfford(cost) {
    return GameState.run.credits >= cost;
  },

  spend(amount) {
    if (!this.canAfford(amount)) return false;
    GameState.run.credits -= amount;
    return true;
  },

  earn(amount) {
    GameState.run.credits += amount;
  },
};
