/* Void Meridian — Crew Simulation Engine */

const CrewEngine = {
  ROLES: ['engineer', 'pilot', 'medic', 'soldier', 'technician', 'diplomat', 'scientist'],
  TRAITS: ['reckless', 'stoic', 'vocal', 'curious', 'haunted', 'pragmatic', 'idealistic'],

  // ─── Crew Generation ──────────────────────────────────────────

  generateStarterCrew(count, qualityPoints) {
    const crew = [];
    const usedRoles = new Set();

    for (let i = 0; i < count; i++) {
      let role;
      const availableRoles = this.ROLES.filter(r => !usedRoles.has(r));
      if (availableRoles.length > 0) {
        role = availableRoles[Math.floor(Math.random() * availableRoles.length)];
      } else {
        role = this.ROLES[Math.floor(Math.random() * this.ROLES.length)];
      }
      usedRoles.add(role);

      crew.push(this._createFromArchetype(role, qualityPoints));
    }
    return crew;
  },

  _createFromArchetype(role, qualityBonus) {
    const archetype = Registry.getArchetypeByRole(role);

    let name, trait, morale, loyalty, combatStats, emoji;

    if (archetype) {
      name = archetype.name_pool
        ? archetype.name_pool[Math.floor(Math.random() * archetype.name_pool.length)]
        : this._generateName();
      trait = archetype.compatible_traits
        ? archetype.compatible_traits[Math.floor(Math.random() * archetype.compatible_traits.length)]
        : this.TRAITS[Math.floor(Math.random() * this.TRAITS.length)];
      const mRange = archetype.morale_start_range || [45, 65];
      const lRange = archetype.loyalty_start_range || [30, 50];
      morale = mRange[0] + Math.floor(Math.random() * (mRange[1] - mRange[0] + 1));
      loyalty = lRange[0] + Math.floor(Math.random() * (lRange[1] - lRange[0] + 1));
      combatStats = archetype.combat_stats || { atk_modifier: 0, def_modifier: 0 };
      emoji = archetype.emoji || this._roleEmoji(role);
    } else {
      name = this._generateName();
      trait = this.TRAITS[Math.floor(Math.random() * this.TRAITS.length)];
      morale = Math.min(100, 40 + (qualityBonus || 0) * 5 + Math.floor(Math.random() * 20));
      loyalty = Math.min(100, 35 + (qualityBonus || 0) * 4 + Math.floor(Math.random() * 20));
      combatStats = { atk_modifier: 0, def_modifier: 0 };
      emoji = this._roleEmoji(role);
    }

    if (qualityBonus) {
      morale = Math.min(100, morale + qualityBonus * 3);
      loyalty = Math.min(100, loyalty + qualityBonus * 2);
    }

    return {
      id: `crew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      role,
      emoji,
      trait,
      morale,
      loyalty,
      combatStats,
      conditions: [],
      relationships: [],
      dead: false,
      isNamed: false,
      namedId: null,
      secretRevealed: false,
    };
  },

  // ─── Named Character Recruitment ──────────────────────────────

  addCrewFromTemplate(crewId) {
    const named = Registry.crewNamed.get(crewId);
    if (named) return this._recruitNamed(named);

    const archetype = Registry.crewArchetypes.get(crewId);
    if (archetype) {
      const member = this._createFromArchetype(archetype.role, 0);
      GameState.run.crew.push(member);
      GameState.addLog('crew', `${member.name} (${member.role}) joined the crew.`);
      return member;
    }

    // Fallback: parse role from crewId for event-referenced recruits
    const roleMatch = crewId.match(/(engineer|pilot|medic|soldier|technician|diplomat|scientist)/);
    if (roleMatch) {
      const member = this._createFromArchetype(roleMatch[1], 0);
      member.name = this._formatRecruitName(crewId);
      GameState.run.crew.push(member);
      GameState.addLog('crew', `${member.name} (${member.role}) joined the crew.`);
      return member;
    }

    return null;
  },

  _recruitNamed(named) {
    const member = {
      id: `crew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: named.name,
      role: named.role,
      emoji: named.emoji || this._roleEmoji(named.role),
      trait: named.trait || 'stoic',
      morale: named.morale_start || 50,
      loyalty: named.loyalty_start || 30,
      combatStats: { atk_modifier: 0, def_modifier: 0 },
      conditions: [],
      relationships: [],
      dead: false,
      isNamed: true,
      namedId: named.id,
      secretRevealed: false,
      uniquePassive: named.unique_passive || null,
      personalityDescription: named.personality_description || null,
      factionAffiliation: named.faction_affiliation || null,
    };

    GameState.run.crew.push(member);

    // Track encounter in meta state
    if (!GameState.meta.namedCrewState[named.id]) {
      GameState.meta.namedCrewState[named.id] = { encountered: true, secret_revealed: false };
    } else {
      GameState.meta.namedCrewState[named.id].encountered = true;
    }

    GameState.addLog('crew', `${member.name} (${member.role}) joined the crew.`);
    return member;
  },

  _formatRecruitName(crewId) {
    return crewId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  },

  // ─── Morale & Loyalty ─────────────────────────────────────────

  adjustMorale(member, delta) {
    if (member.dead) return;
    member.morale = Math.max(0, Math.min(100, member.morale + delta));

    if (member.trait === 'stoic') {
      if (delta < 0) member.morale = Math.min(member.morale + Math.floor(Math.abs(delta) * 0.2), 100);
    } else if (member.trait === 'vocal') {
      this._spreadMorale(member, Math.sign(delta) * 3);
    }
  },

  adjustMoraleAll(delta) {
    for (const member of GameState.run.crew) {
      if (!member.dead) this.adjustMorale(member, delta);
    }
  },

  adjustLoyalty(member, delta) {
    if (member.dead) return;
    member.loyalty = Math.max(0, Math.min(100, member.loyalty + delta));

    // Check for secret reveal on named characters
    if (member.isNamed && member.loyalty >= 80 && !member.secretRevealed) {
      this._revealSecret(member);
    }
  },

  _revealSecret(member) {
    member.secretRevealed = true;
    const named = Registry.crewNamed.get(member.namedId);
    if (named && named.secret_loyalty_80) {
      GameState.addLog('crew', `${member.name} trusts you enough to share a secret.`);
      GameState.addLog('crew', named.secret_loyalty_80);
    }
    if (member.namedId && GameState.meta.namedCrewState[member.namedId]) {
      GameState.meta.namedCrewState[member.namedId].secret_revealed = true;
    }
  },

  _spreadMorale(source, delta) {
    for (const member of GameState.run.crew) {
      if (member.id !== source.id && !member.dead) {
        member.morale = Math.max(0, Math.min(100, member.morale + delta));
      }
    }
  },

  // ─── Crew Death ───────────────────────────────────────────────

  killCrewMember(roleOrId) {
    let member;
    if (roleOrId.startsWith('crew_')) {
      member = GameState.run.crew.find(c => c.id === roleOrId && !c.dead);
    } else {
      member = GameState.run.crew.find(c => c.role === roleOrId && !c.dead);
    }

    if (!member) return null;

    member.dead = true;
    member.conditions = ['dead'];
    GameState.addLog('crew', `${member.name} (${member.role}) was lost.`);

    if (member.isNamed && member.uniquePassive) {
      GameState.addLog('crew', `${member.name}'s final act: ${member.uniquePassive}`);
    }

    this.adjustMoraleAll(-15);

    for (const c of GameState.run.crew) {
      if (!c.dead && c.trait === 'idealistic') {
        this.adjustLoyalty(c, -10);
      }
    }

    return member;
  },

  // ─── Post-Event Tick ──────────────────────────────────────────

  tickAfterEvent() {
    for (const member of GameState.run.crew) {
      if (member.dead) continue;

      if (member.morale > 55) member.morale -= 1;
      else if (member.morale < 45) member.morale += 1;

      if (member.loyalty <= 15) {
        this._checkMutiny(member);
      } else if (member.loyalty <= 30) {
        this._checkRefusal(member);
      }
    }
  },

  _checkRefusal(member) {
    if (Math.random() < 0.2) {
      GameState.addLog('system', `${member.name} is becoming unreliable. Loyalty critically low.`);
    }
  },

  _checkMutiny(member) {
    if (Math.random() < 0.1) {
      GameState.addLog('system', `${member.name} is on the verge of mutiny!`);
    }
  },

  // ─── Helpers ──────────────────────────────────────────────────

  _roleEmoji(role) {
    const emojis = {
      engineer: '🔧', pilot: '🚀', medic: '💉',
      soldier: '⚔', technician: '💻', diplomat: '🤝', scientist: '🔬',
    };
    return emojis[role] || '👤';
  },

  _generateName() {
    const first = ['Kira', 'Jace', 'Nev', 'Thane', 'Cass', 'Rook', 'Lyra', 'Dex', 'Senna', 'Vex',
                    'Kai', 'Brin', 'Zara', 'Hollis', 'Fen', 'Mira', 'Ash', 'Pax', 'Sable', 'Ren',
                    'Tove', 'Quinn', 'Wren', 'Corr', 'Haze', 'Leith', 'Nyx', 'Orin', 'Vale', 'Yael'];
    const last = ['Vance', 'Drex', 'Corva', 'Ashby', 'Kael', 'Morrow', 'Strand', 'Vex', 'Thorne', 'Cade',
                  'Holt', 'Reis', 'Voss', 'Kade', 'Cross', 'Lorn', 'Shade', 'Peak', 'Drift', 'Stone'];
    return first[Math.floor(Math.random() * first.length)] + ' ' +
           last[Math.floor(Math.random() * last.length)];
  },
};
