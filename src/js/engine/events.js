/* Void Meridian — Event Resolution Engine */

const EventEngine = {
  triggerNodeEvent(node) {
    const context = Registry.buildEventContext(node.type);
    const eligible = Registry.getEligibleEvents(context);

    let event;
    if (eligible.length > 0) {
      // Pick a random eligible event
      event = eligible[Math.floor(Math.random() * eligible.length)];
      // Deep clone so we don't mutate registry data
      event = JSON.parse(JSON.stringify(event));
    } else {
      // Fallback generic event
      event = this._fallbackEvent(node.type);
    }

    event._nodeType = node.type;
    GameState.run.activeEvent = event;
    GameState.addLog('event', event.narrative ? event.narrative.substring(0, 60) + '...' : `Entered ${node.type} node`);
    GameState.screen = 'event';
    Tabs.activeTab = 'event';
    Game.render();
  },

  resolveChoice(event, choice) {
    let outcomeKey = 'success';

    // Run stat check if present
    if (choice.statCheck) {
      const result = this._rollStatCheck(choice.statCheck);
      outcomeKey = result;
    }

    const outcomes = choice.outcomes || {};
    const outcome = outcomes[outcomeKey] || outcomes.success || { text: 'Something happens.' };

    // Apply effects
    if (outcome.effects) {
      this._applyEffects(outcome.effects);
    }

    // Set flags
    if (outcome.flags) {
      for (const flag of outcome.flags) {
        if (!GameState.run.runFlags.includes(flag)) {
          GameState.run.runFlags.push(flag);
        }
      }
    }

    // Store outcome on event for display
    event._outcome = outcome;
    event._chosenText = choice.text;

    GameState.addLog('event', `Chose: "${choice.text}" → ${outcomeKey}`);
    GameState.save();
    Game.render();
  },

  checkRequirements(requirements) {
    if (!requirements) return true;
    const run = GameState.run;

    for (const req of requirements) {
      switch (req.type) {
        case 'hasRole':
          if (!run.crew.some(c => !c.dead && c.role === req.role)) return false;
          break;
        case 'minCredits':
          if (run.credits < req.value) return false;
          break;
        case 'hasFlag':
          if (!run.runFlags.includes(req.flag)) return false;
          break;
        case 'minFuel':
          if (run.fuel < req.value) return false;
          break;
        case 'captainStat':
          if ((run.captain.stats[req.stat] || 0) < req.value) return false;
          break;
        case 'hasModule':
          if (!run.ship.equippedModules.some(m => m.id === req.moduleId)) return false;
          break;
      }
    }
    return true;
  },

  _rollStatCheck(check) {
    // check: { stat, difficulty, crewRole? }
    let value = 0;

    // Captain stat
    if (check.stat && GameState.run.captain.stats[check.stat]) {
      value += GameState.run.captain.stats[check.stat];
    }

    // Crew bonus from relevant role
    if (check.crewRole) {
      const crewMember = GameState.run.crew.find(c => !c.dead && c.role === check.crewRole);
      if (crewMember) {
        value += 2;
        // Morale bonus/penalty
        if (crewMember.morale >= 75) value += 1;
        else if (crewMember.morale <= 25) value -= 1;
      }
    }

    // Roll d6
    const roll = 1 + Math.floor(Math.random() * 6);
    const total = value + roll;
    const difficulty = check.difficulty || 7;

    if (total >= difficulty + 3) return 'success';
    if (total >= difficulty) return 'partial';
    return 'failure';
  },

  _applyEffects(effects) {
    for (const effect of effects) {
      switch (effect.type) {
        case 'hullDamage':
          ShipEngine.takeDamage(effect.value);
          break;
        case 'hullRepair':
          ShipEngine.repair(effect.value);
          break;
        case 'credits':
          GameState.run.credits = Math.max(0, GameState.run.credits + effect.value);
          break;
        case 'fuel':
          GameState.run.fuel = Math.max(0, GameState.run.fuel + effect.value);
          break;
        case 'morale':
          CrewEngine.adjustMoraleAll(effect.value);
          break;
        case 'crewMorale':
          if (effect.role) {
            const member = GameState.run.crew.find(c => !c.dead && c.role === effect.role);
            if (member) CrewEngine.adjustMorale(member, effect.value);
          }
          break;
        case 'loyalty':
          if (effect.role) {
            const member = GameState.run.crew.find(c => !c.dead && c.role === effect.role);
            if (member) CrewEngine.adjustLoyalty(member, effect.value);
          }
          break;
        case 'factionRep':
          EconomyEngine.adjustReputation(effect.faction, effect.value);
          break;
        case 'addCrew':
          CrewEngine.addCrewFromTemplate(effect.crewId);
          break;
        case 'killCrew':
          CrewEngine.killCrewMember(effect.role || effect.crewId);
          break;
        case 'addModule':
          ShipEngine.addModule(effect.moduleId);
          break;
        case 'systemDamage':
          ShipEngine.damageSystem(effect.system);
          break;
        case 'startCombat':
          CombatEngine.startCombat(effect.enemyId);
          break;
        case 'resonance':
          GameState.meta.resonance += effect.value;
          break;
      }
    }
  },

  _fallbackEvent(nodeType) {
    const fallbacks = {
      combat: {
        id: '_fallback_combat',
        nodeType: 'combat',
        narrative: 'Sensors detect a hostile vessel emerging from behind an asteroid. Their weapons are already charging.',
        choices: [
          {
            text: 'Battle stations!',
            outcomes: {
              success: { text: 'Combat engaged.', effects: [{ type: 'startCombat', enemyId: '_generic_fighter' }] },
            },
          },
          {
            text: 'Attempt to flee',
            statCheck: { stat: 'intuition', difficulty: 7 },
            outcomes: {
              success: { text: 'You slip away before they can lock on.', effects: [{ type: 'fuel', value: -1 }] },
              failure: { text: 'Too slow. They open fire.', effects: [{ type: 'hullDamage', value: 10 }, { type: 'startCombat', enemyId: '_generic_fighter' }] },
            },
          },
        ],
      },
      trade: {
        id: '_fallback_trade',
        nodeType: 'trade',
        narrative: 'A battered trading post hangs in the void, its beacon flickering. A few merchants eye your ship with cautious interest.',
        choices: [
          {
            text: 'Browse the wares',
            outcomes: { success: { text: 'You trade with the merchants. A fair deal, nothing more.' } },
          },
          {
            text: 'Move on',
            outcomes: { success: { text: 'You leave the trading post behind.' } },
          },
        ],
      },
      derelict: {
        id: '_fallback_derelict',
        nodeType: 'derelict',
        narrative: 'A dead ship drifts ahead, its hull torn open. Emergency lights still pulse inside — a rhythm like a heartbeat.',
        choices: [
          {
            text: 'Send a boarding party',
            statCheck: { stat: 'resolve', difficulty: 6, crewRole: 'engineer' },
            outcomes: {
              success: { text: 'Your crew finds useful salvage.', effects: [{ type: 'credits', value: 30 }] },
              partial: { text: 'Some salvage recovered, but one of the crew was injured.', effects: [{ type: 'credits', value: 15 }] },
              failure: { text: 'The structure is unstable. You barely get everyone out.', effects: [{ type: 'hullDamage', value: 5 }] },
            },
          },
          {
            text: 'Pass by',
            outcomes: { success: { text: 'The derelict fades into the dark behind you.' } },
          },
        ],
      },
      planet: {
        id: '_fallback_planet',
        nodeType: 'planet',
        narrative: 'A terrestrial world — atmosphere breathable, surface scarred by ancient construction. Someone built here once.',
        choices: [
          {
            text: 'Land and explore',
            statCheck: { stat: 'intuition', difficulty: 6 },
            outcomes: {
              success: { text: 'You find remnants of value.', effects: [{ type: 'credits', value: 20 }, { type: 'fuel', value: 2 }] },
              partial: { text: 'Nothing of value, but at least it was peaceful.', effects: [{ type: 'morale', value: 5 }] },
              failure: { text: 'Something in the ruins spooked the crew.', effects: [{ type: 'morale', value: -10 }] },
            },
          },
          {
            text: 'Orbit and scan',
            outcomes: { success: { text: 'Scans complete. Nothing actionable detected.' } },
          },
        ],
      },
      rest: {
        id: '_fallback_rest',
        nodeType: 'rest',
        narrative: 'A quiet pocket of space. No threats on sensors. The crew exhales for the first time in hours.',
        choices: [
          {
            text: 'Rest and repair',
            outcomes: { success: { text: 'The crew rests. Hull patched, spirits lifted.', effects: [{ type: 'hullRepair', value: 15 }, { type: 'morale', value: 10 }] } },
          },
        ],
      },
    };

    return fallbacks[nodeType] || {
      id: '_fallback_generic',
      nodeType,
      narrative: 'You arrive at the coordinates. The void stretches in all directions.',
      choices: [
        {
          text: 'Investigate',
          outcomes: { success: { text: 'Nothing of note. You move on.' } },
        },
      ],
    };
  },
};
