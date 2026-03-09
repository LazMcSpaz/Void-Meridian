/* Void Meridian — Crew Simulation Engine */

const CrewEngine = {
  ROLES: ['engineer', 'pilot', 'medic', 'soldier', 'technician', 'diplomat', 'scientist'],
  PERSONALITIES: ['reckless', 'stoic', 'vocal', 'curious', 'haunted', 'pragmatic', 'idealistic'],

  generateStarterCrew(count, qualityPoints) {
    const crew = [];
    const usedRoles = new Set();

    for (let i = 0; i < count; i++) {
      // Try to diversify roles
      let role;
      const availableRoles = this.ROLES.filter(r => !usedRoles.has(r));
      if (availableRoles.length > 0) {
        role = availableRoles[Math.floor(Math.random() * availableRoles.length)];
      } else {
        role = this.ROLES[Math.floor(Math.random() * this.ROLES.length)];
      }
      usedRoles.add(role);

      const baseMorale = 40 + qualityPoints * 5 + Math.floor(Math.random() * 20);
      const baseLoyalty = 35 + qualityPoints * 4 + Math.floor(Math.random() * 20);

      crew.push({
        id: `crew_${Date.now()}_${i}`,
        name: this._generateName(),
        role,
        personality: this.PERSONALITIES[Math.floor(Math.random() * this.PERSONALITIES.length)],
        morale: Math.min(100, baseMorale),
        loyalty: Math.min(100, baseLoyalty),
        conditions: [],
        relationships: [],
        dead: false,
        backstory: null,
        unique: false,
      });
    }
    return crew;
  },

  addCrewFromTemplate(crewId) {
    const template = Registry.getCrew(crewId);
    if (!template) return null;

    const member = {
      id: `crew_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: template.name,
      role: template.role,
      personality: template.personality,
      morale: template.baseStats ? template.baseStats.morale : 50,
      loyalty: template.baseStats ? template.baseStats.loyalty : 50,
      conditions: [],
      relationships: [],
      dead: false,
      backstory: template.backstory || null,
      unique: template.unique || false,
      factionAffinity: template.factionAffinity || null,
    };

    GameState.run.crew.push(member);
    GameState.addLog('crew_join', `${member.name} (${member.role}) joined the crew.`);
    return member;
  },

  adjustMorale(member, delta) {
    if (member.dead) return;
    member.morale = Math.max(0, Math.min(100, member.morale + delta));

    // Personality modifiers
    if (member.personality === 'stoic') {
      // Stoic crew resist morale swings
      if (delta < 0) member.morale = Math.min(member.morale + Math.floor(Math.abs(delta) * 0.2), 100);
    } else if (member.personality === 'vocal') {
      // Vocal crew amplify morale effects on neighbors
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
  },

  _spreadMorale(source, delta) {
    for (const member of GameState.run.crew) {
      if (member.id !== source.id && !member.dead) {
        member.morale = Math.max(0, Math.min(100, member.morale + delta));
      }
    }
  },

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
    GameState.addLog('crew_death', `${member.name} (${member.role}) was lost.`);

    // Morale hit to all surviving crew
    this.adjustMoraleAll(-15);

    // Loyalty hit if idealistic crew see deaths
    for (const c of GameState.run.crew) {
      if (!c.dead && c.personality === 'idealistic') {
        this.adjustLoyalty(c, -10);
      }
    }

    return member;
  },

  tickAfterEvent() {
    // Natural morale/loyalty drift after each event node
    for (const member of GameState.run.crew) {
      if (member.dead) continue;

      // Slow drift toward 50
      if (member.morale > 55) member.morale -= 1;
      else if (member.morale < 45) member.morale += 1;

      // Check for autonomy issues
      if (member.loyalty <= 15) {
        this._checkMutiny(member);
      } else if (member.loyalty <= 30) {
        this._checkRefusal(member);
      }
    }
  },

  _checkRefusal(member) {
    // Low loyalty crew may refuse orders
    if (Math.random() < 0.2) {
      GameState.addLog('system', `${member.name} is becoming unreliable. Loyalty critically low.`);
    }
  },

  _checkMutiny(member) {
    if (Math.random() < 0.1) {
      GameState.addLog('system', `${member.name} is on the verge of mutiny!`);
      // Could escalate to actual mutiny event in future
    }
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
