/* Void Meridian — Economy & Faction System */

const EconomyEngine = {
  FACTIONS: ['concord_assembly', 'vreth_dominion', 'drifter_compact', 'remnant_collective'],
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
    const displayName = this.getFactionDisplayName(faction);
    GameState.addLog('system', `${displayName} reputation: ${label} (${GameState.run.factions[faction] > 0 ? '+' : ''}${GameState.run.factions[faction]})`);
  },

  getFactionDisplayName(faction) {
    const names = {
      concord_assembly: 'Concord Assembly',
      vreth_dominion: 'Vreth Dominion',
      drifter_compact: 'Drifter Compact',
      remnant_collective: 'Remnant Collective',
    };
    return names[faction] || faction;
  },

  getRepLabel(faction) {
    const val = GameState.run.factions[faction] || 0;
    return this.REP_LABELS[String(val)] || 'Neutral';
  },

  getPriceModifier(faction) {
    const rep = GameState.run.factions[faction] || 0;
    // Friendly factions give discounts, hostile charge more
    let modifier = 1 - rep * 0.1; // +3 = 0.7x, -3 = 1.3x
    // Scavenger's Eye: additional 15% discount
    if (GameState.run.captain.abilities.includes('scavenger_eye')) {
      modifier -= 0.15;
    }
    // Kess passive: +10% trade prices at Concord stations
    if (faction === 'concord_assembly' && CrewEngine.hasNamedCrew('kess')) {
      modifier -= 0.10;
    }
    return Math.max(0.3, modifier);
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
