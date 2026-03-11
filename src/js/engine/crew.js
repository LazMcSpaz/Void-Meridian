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
      this._applyRecruitBonuses(member);
      GameState.addLog('crew', `${member.name} (${member.role}) joined the crew.`);
      return member;
    }

    // Fallback: parse role from crewId for event-referenced recruits
    const roleMatch = crewId.match(/(engineer|pilot|medic|soldier|technician|diplomat|scientist)/);
    if (roleMatch) {
      const member = this._createFromArchetype(roleMatch[1], 0);
      member.name = this._formatRecruitName(crewId);
      GameState.run.crew.push(member);
      this._applyRecruitBonuses(member);
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
    this._applyRecruitBonuses(member);

    // Track encounter in meta state
    if (!GameState.meta.namedCrewState[named.id]) {
      GameState.meta.namedCrewState[named.id] = { encountered: true, secret_revealed: false };
    } else {
      GameState.meta.namedCrewState[named.id].encountered = true;
    }

    GameState.addLog('crew', `${member.name} (${member.role}) joined the crew.`);
    return member;
  },

  _applyRecruitBonuses(member) {
    // Med Bay: +5 morale on recruit
    if (GameState.run.ship.equippedModules.some(m => m.id === 'mod_med_bay')) {
      member.morale = Math.min(100, member.morale + 5);
    }
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

    // Iron Will: prevent one crew death per run
    if (GameState.run.captain.abilities.includes('iron_will') &&
        !GameState.run.runFlags.includes('iron_will_used')) {
      GameState.run.runFlags.push('iron_will_used');
      GameState.addLog('crew', `${member.name} should have died — but your iron will kept them alive.`);
      this.adjustMorale(member, -20);
      // Rook passive: crew injuries are less severe (shorter shaken duration)
      const rookPresent = this.hasNamedCrew('rook');
      this.addCondition(member, 'shaken', rookPresent ? 2 : 4);
      return null;
    }

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
    const hasMedBay = GameState.run.ship.equippedModules.some(m => m.id === 'mod_med_bay');
    // Dr. Yema Osha passive: +10% crew healing — conditions tick down 1 faster
    const hasOsha = this.hasNamedCrew('dr_yema');

    for (const member of GameState.run.crew) {
      if (member.dead) continue;

      // Morale decay/recovery — resolve reduces negative drift
      const resolve = (GameState.run.captain.stats && GameState.run.captain.stats.resolve) || 1;
      if (member.morale > 55) {
        // High resolve slows morale decay: resolve 3 = no decay
        if (resolve < 3) member.morale -= 1;
      } else if (member.morale < 45) {
        member.morale += 1;
        // High command helps crew recover morale faster
        const command = (GameState.run.captain.stats && GameState.run.captain.stats.command) || 1;
        if (command >= 3) member.morale += 1;
      }

      // Condition healing: each condition ticks down duration; Med Bay speeds it up
      if (member.conditions && member.conditions.length > 0) {
        const healed = [];
        for (let i = member.conditions.length - 1; i >= 0; i--) {
          const cond = member.conditions[i];
          if (cond === 'dead') continue;

          // Conditions stored as strings get a single-tick grace period then clear
          // Conditions stored as objects {name, duration} tick down
          if (typeof cond === 'string') {
            // Convert legacy string conditions to timed: 3 nodes (2 with Med Bay, faster with Osha)
            let baseDuration = hasMedBay ? 2 : 3;
            if (hasOsha) baseDuration = Math.max(1, baseDuration - 1);
            member.conditions[i] = { name: cond, duration: baseDuration };
          } else if (typeof cond === 'object' && cond.duration != null) {
            let healRate = hasMedBay ? 2 : 1;
            if (hasOsha) healRate += 1;
            cond.duration -= healRate;
            if (cond.duration <= 0) {
              healed.push(cond.name);
              member.conditions.splice(i, 1);
            }
          }
        }
        for (const h of healed) {
          GameState.addLog('crew', `${member.name} recovered from ${h}.`);
        }
      }

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

  // ─── Crew Barks (reactions to events) ────────────────────────────

  BARK_LINES: {
    // Keyed by trait, sub-keyed by outcome context
    reckless: {
      success:  ['"Ha! Told you it\'d work."', '"That\'s what I\'m talking about."', '"Easy. Too easy."'],
      failure:  ['"Well that went sideways."', '"...worth a shot."', '"I\'d do it again."'],
      danger:   ['"Now THIS is what I signed up for."', '"Bring it."', '"My kind of odds."'],
      loss:     ['"Damn."', '"...didn\'t see that coming."'],
      gain:     ['"Score."', '"That\'ll keep us flying."'],
    },
    stoic: {
      success:  ['"Noted."', '"As expected."', '"Acceptable outcome."'],
      failure:  ['"We adapt."', '"It happens."', '"Moving on."'],
      danger:   ['"Stay focused."', '"Steady."'],
      loss:     ['"We endure."', '"There will be more."'],
      gain:     ['"Good. We needed that."'],
    },
    vocal: {
      success:  ['"YES! Did everyone see that?!"', '"I KNEW we\'d pull through!"', '"We\'re unstoppable!"'],
      failure:  ['"This is bad. This is really bad."', '"I don\'t like this at all."', '"We need a new plan."'],
      danger:   ['"Oh no oh no oh no—"', '"Does ANYONE have a plan?!"'],
      loss:     ['"That\'s... that\'s not good."', '"We can\'t keep losing like this."'],
      gain:     ['"Finally some good news!"', '"See? Things are looking up!"'],
    },
    curious: {
      success:  ['"Fascinating. I wonder why that worked."', '"Interesting outcome."', '"I want to study this further."'],
      failure:  ['"Hmm. What went wrong?"', '"We can learn from this."'],
      danger:   ['"I\'ve never seen anything like this."', '"Remarkable, if terrifying."'],
      loss:     ['"A setback, but an informative one."'],
      gain:     ['"Excellent. More data."', '"This could be useful."'],
    },
    haunted: {
      success:  ['"...this time."', '"Don\'t get comfortable."', '"I\'ve seen this go wrong before."'],
      failure:  ['"I knew it."', '"It always ends like this."', '"...just like last time."'],
      danger:   ['"I remember this feeling."', '"...not again."'],
      loss:     ['"Of course."', '"We were never going to keep that."'],
      gain:     ['"It won\'t last."', '"...enjoy it while you can."'],
    },
    pragmatic: {
      success:  ['"Good. Efficient."', '"That\'s the smart play."', '"Exactly as planned."'],
      failure:  ['"We need to cut our losses."', '"Regroup. Reassess."'],
      danger:   ['"Calculate the odds. Then act."', '"What are our options?"'],
      loss:     ['"Factor it into the budget."', '"Could be worse."'],
      gain:     ['"That improves our margins."', '"Smart investment."'],
    },
    idealistic: {
      success:  ['"We did the right thing."', '"This is why we keep going."', '"There\'s still good out here."'],
      failure:  ['"We can\'t give up."', '"There has to be another way."'],
      danger:   ['"We have to protect the crew."', '"No one gets left behind."'],
      loss:     ['"We\'ll find a way."', '"This isn\'t over."'],
      gain:     ['"For the crew."', '"This will help everyone."'],
    },
  },

  getEventBark(outcomeLevel, outcome) {
    const living = GameState.run.crew.filter(c => !c.dead);
    if (living.length === 0) return null;

    // Pick a random living crew member
    const speaker = living[Math.floor(Math.random() * living.length)];
    const traitLines = this.BARK_LINES[speaker.trait];
    if (!traitLines) return null;

    // Determine bark context from outcome
    let context = outcomeLevel; // success, partial → success; failure → failure
    if (outcomeLevel === 'partial') context = 'success';

    // Override context based on outcome effects
    if (outcome) {
      if (outcome.hull_delta < -10 || outcome.morale_delta < -10) context = 'danger';
      if (outcome.hull_delta < 0 || outcome.morale_delta < 0) context = context === 'danger' ? 'danger' : 'loss';
      if (outcome.rewards && outcome.rewards.some(r => r.value > 0)) context = 'gain';
      if (outcomeLevel === 'failure') context = 'failure';
    }

    const lines = traitLines[context] || traitLines.success;
    if (!lines || lines.length === 0) return null;

    const line = lines[Math.floor(Math.random() * lines.length)];
    return { speaker, line };
  },

  // ─── Named Crew Passive Helpers ─────────────────────────────────

  /** Check if a named crew member (by namedId prefix) is alive on board */
  hasNamedCrew(namedIdPrefix) {
    return GameState.run.crew.some(c => !c.dead && c.isNamed && c.namedId && c.namedId.startsWith(namedIdPrefix));
  },

  getNamedCrew(namedIdPrefix) {
    return GameState.run.crew.find(c => !c.dead && c.isNamed && c.namedId && c.namedId.startsWith(namedIdPrefix));
  },

  // ─── Condition Helpers ──────────────────────────────────────────

  hasCondition(member, condName) {
    if (!member.conditions) return false;
    return member.conditions.some(c => (typeof c === 'string' ? c : c.name) === condName);
  },

  addCondition(member, condName, duration) {
    if (member.dead || this.hasCondition(member, condName)) return;
    // Dr. Yema Osha passive: pathogen immunity — unaffected by biological conditions
    if (member.isNamed && member.namedId && member.namedId.startsWith('dr_yema')) {
      GameState.addLog('crew', `${member.name}'s pathogen immunity protected her.`);
      return;
    }
    const hasMedBay = GameState.run.ship.equippedModules.some(m => m.id === 'mod_med_bay');
    member.conditions.push({ name: condName, duration: duration || (hasMedBay ? 2 : 3) });
    GameState.addLog('crew', `${member.name} is now ${condName}.`);
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
