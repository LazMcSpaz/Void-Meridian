/* Void Meridian — Event Resolution Engine (events_master.json schema) */

const EventEngine = {

  // ─── Trigger an event at a map node ────────────────────────

  triggerNodeEvent(node) {
    const factionContext = node.faction || 'none';
    const eligible = Registry.getEligibleEvents(node.type, factionContext);

    let event;
    if (eligible.length > 0) {
      event = eligible[Math.floor(Math.random() * eligible.length)];
      event = JSON.parse(JSON.stringify(event)); // deep clone
    } else {
      // Relaxed fallback: ignore depth_zone
      const relaxed = (Registry.eventsByType[node.type] || []).filter(evt => {
        if (evt.faction_context && evt.faction_context !== 'none' && evt.faction_context !== factionContext) return false;
        if ((evt.min_resonance || 0) > GameState.meta.resonance) return false;
        if (GameState.run.seenEventIds && GameState.run.seenEventIds.includes(evt.id)) return false;
        return true;
      });
      if (relaxed.length > 0) {
        event = JSON.parse(JSON.stringify(relaxed[Math.floor(Math.random() * relaxed.length)]));
      } else {
        event = this._placeholderEvent();
      }
    }

    GameState.run.activeEvent = event;
    GameState.run.activeEventStep = 0;
    GameState.run.lastStepOutcomes = {};
    GameState.addLog('event', event.setup_text ? event.setup_text.substring(0, 80) + '...' : `Entered ${node.type} node`);
    GameState.screen = 'event';
    Tabs.activeTab = 'event';
    GameState.save();
    Game.render();
  },

  // ─── Check if an option is available ──────────────────────

  checkOptionAvailability(option) {
    const run = GameState.run;

    if (option.requires_crew_role) {
      if (!run.crew.some(c => !c.dead && c.role === option.requires_crew_role)) {
        return { available: false, hint: option.locked_hint || '' };
      }
    }

    if (option.requires_module) {
      if (!run.ship.equippedModules.some(m => m.id === option.requires_module)) {
        return { available: false, hint: option.locked_hint || '' };
      }
    }

    if (option.requires_rep) {
      const faction = option.requires_rep.faction;
      const minTier = parseInt(option.requires_rep.min_tier, 10);
      const currentRep = run.factions[faction] || 0;
      if (currentRep < minTier) {
        return { available: false, hint: option.locked_hint || '' };
      }
    }

    if (option.requires_flag) {
      if (!run.runFlags.includes(option.requires_flag)) {
        return { available: false, hint: option.locked_hint || '' };
      }
    }

    if (option.requires_ability) {
      if (!run.captain.abilities.includes(option.requires_ability)) {
        return { available: false, hint: option.locked_hint || '' };
      }
    }

    return { available: true, hint: '' };
  },

  // ─── Resolve a check for a chosen option ──────────────────

  resolveCheck(option) {
    if (!option.check_type || option.check_type === 'none') {
      return 'success';
    }

    const run = GameState.run;
    let skillValue = 0;

    if (option.check_type === 'skill' && option.check_target) {
      // Find best crew member with the matching role
      const crewMember = run.crew.find(c => !c.dead && c.role === option.check_target);
      if (crewMember) {
        // Base role bonus: having the right role gives 30 points
        skillValue = 30;
        // Morale modifier: (morale - 50) * 0.2 gives -10 to +10
        skillValue += (crewMember.morale - 50) * 0.2;
      } else {
        // No matching role crew — attempt with lower skill
        skillValue = 10;
      }
    } else if (option.check_type === 'stat' && option.check_target) {
      // Captain ability check
      const statVal = run.captain.stats[option.check_target] || 0;
      skillValue = statVal * 10;
      // Average morale modifier
      const livingCrew = run.crew.filter(c => !c.dead);
      if (livingCrew.length > 0) {
        const avgMorale = livingCrew.reduce((sum, c) => sum + c.morale, 0) / livingCrew.length;
        skillValue += (avgMorale - 50) * 0.2;
      }
    }

    skillValue = Math.max(0, Math.min(100, skillValue));

    const thresholds = {
      easy:     { success: 40, partial: 20 },
      medium:   { success: 60, partial: 35 },
      hard:     { success: 75, partial: 50 },
      critical: { success: 90, partial: 70 },
    };

    const t = thresholds[option.difficulty] || thresholds.medium;
    const roll = Math.random() * 100;

    if (roll + skillValue >= t.success) return 'success';
    if (roll + skillValue >= t.partial) return 'partial';
    return 'failure';
  },

  // ─── Select option and resolve outcome ────────────────────

  selectOption(optionIndex) {
    const event = GameState.run.activeEvent;
    if (!event) return;

    const stepIdx = GameState.run.activeEventStep;
    const step = this._getCurrentStep(event, stepIdx);
    if (!step || !step.options || optionIndex >= step.options.length) return;

    const option = step.options[optionIndex];
    const outcomeLevel = this.resolveCheck(option);
    const outcome = option.outcomes[outcomeLevel];

    if (!outcome) {
      // Fallback to success if outcome level missing
      const fallback = option.outcomes.success;
      if (fallback) {
        this._applyOutcome(fallback, event);
      }
    } else {
      this._applyOutcome(outcome, event);
    }

    // Store step outcome for conditional branching
    GameState.run.lastStepOutcomes[step.step_number] = outcomeLevel;

    // Store for UI display
    event._lastOutcome = outcome || option.outcomes.success;
    event._lastOutcomeLevel = outcomeLevel;
    event._lastChoiceLabel = option.label;
    event._resolved = true;

    GameState.addLog('event', `Chose: "${option.label}" → ${outcomeLevel}`);
    GameState.save();
    Game.render();
  },

  // ─── Advance to next step or finish event ─────────────────

  advanceEvent() {
    const event = GameState.run.activeEvent;
    if (!event) return;

    event._resolved = false;
    event._lastOutcome = null;

    const nextStepIdx = GameState.run.activeEventStep + 1;

    // Look for the next valid step
    for (let i = nextStepIdx; i < event.steps.length; i++) {
      const step = event.steps[i];
      if (this._stepConditionMet(step)) {
        GameState.run.activeEventStep = i;
        GameState.save();
        Game.render();
        return;
      }
    }

    // No more steps — finish event
    this._finishEvent(event);
  },

  _stepConditionMet(step) {
    if (!step.condition) return true;
    const priorOutcome = GameState.run.lastStepOutcomes[step.condition.prior_step];
    return priorOutcome === step.condition.outcome;
  },

  _getCurrentStep(event, stepIdx) {
    if (!event.steps || stepIdx >= event.steps.length) return null;
    return event.steps[stepIdx];
  },

  _finishEvent(event) {
    // Mark event as seen
    if (event.id && event.id !== 'PLACEHOLDER') {
      if (!GameState.run.seenEventIds.includes(event.id)) {
        GameState.run.seenEventIds.push(event.id);
      }
    }

    GameState.run.activeEvent = null;
    GameState.run.activeEventStep = 0;
    GameState.run.lastStepOutcomes = {};

    // Crew tick after event
    CrewEngine.tickAfterEvent();

    // Ship visual update
    ShipEngine.updateVisualStage();

    // Check for hull death
    if (GameState.run.ship.hull <= 0) {
      GameState.endRun('hull_destroyed');
      NexusEngine.accumulateRunResonance();
      GameState.screen = 'gameOver';
    } else {
      Tabs.switchTo('map');
    }

    GameState.save();
    Game.render();
  },

  // ─── Apply outcome effects ────────────────────────────────

  _applyOutcome(outcome, event) {
    // 1. Hull delta
    if (outcome.hull_delta) {
      const ship = GameState.run.ship;
      ship.hull = Math.max(1, Math.min(ship.maxHull, ship.hull + outcome.hull_delta));
    }

    // 2. Morale delta (applied to all crew)
    if (outcome.morale_delta) {
      CrewEngine.adjustMoraleAll(outcome.morale_delta);
    }

    // 3. Loyalty delta (applied to all crew for non-assignment events)
    if (outcome.loyalty_delta) {
      for (const member of GameState.run.crew) {
        if (!member.dead) {
          CrewEngine.adjustLoyalty(member, outcome.loyalty_delta);
        }
      }
    }

    // 4. Resonance delta (meta-currency, persists across runs)
    if (outcome.resonance_delta) {
      GameState.meta.resonance += outcome.resonance_delta;
    }

    // 5. Process rewards array
    if (outcome.rewards && outcome.rewards.length > 0) {
      for (const reward of outcome.rewards) {
        this._processReward(reward);
      }
    }

    // 6. Set flag
    if (outcome.sets_flag) {
      if (!GameState.run.runFlags.includes(outcome.sets_flag)) {
        GameState.run.runFlags.push(outcome.sets_flag);
      }
    }

    // 7. Additional flags
    if (outcome.additional_flags) {
      for (const flag of outcome.additional_flags) {
        if (!GameState.run.runFlags.includes(flag)) {
          GameState.run.runFlags.push(flag);
        }
      }
    }

    // 8. Clear flag
    if (outcome.clears_flag) {
      const idx = GameState.run.runFlags.indexOf(outcome.clears_flag);
      if (idx !== -1) GameState.run.runFlags.splice(idx, 1);
    }
  },

  _processReward(reward) {
    const run = GameState.run;
    switch (reward.type) {
      case 'credits':
        run.credits = Math.max(0, run.credits + reward.value);
        if (reward.value > 0) GameState.addLog('event', `Gained ${reward.value} credits`);
        else if (reward.value < 0) GameState.addLog('event', `Lost ${Math.abs(reward.value)} credits`);
        break;

      case 'fuel':
        run.fuel = Math.max(0, run.fuel + reward.value);
        if (reward.value > 0) GameState.addLog('event', `Gained ${reward.value} fuel`);
        else if (reward.value < 0) GameState.addLog('event', `Lost ${Math.abs(reward.value)} fuel`);
        break;

      case 'hull_repair':
        ShipEngine.repair(reward.value);
        GameState.addLog('event', `Hull repaired by ${reward.value}%`);
        break;

      case 'module':
        ShipEngine.addModule(reward.value);
        break;

      case 'crew_recruit':
        CrewEngine.addCrewFromTemplate(reward.value);
        break;

      case 'rep_up':
        EconomyEngine.adjustReputation(reward.value, 1);
        break;

      case 'rep_down':
        EconomyEngine.adjustReputation(reward.value, -1);
        break;

      case 'resonance':
        GameState.meta.resonance += reward.value;
        GameState.addLog('nexus', `Resonance +${reward.value}`);
        break;

      case 'run_flag':
        if (!run.runFlags.includes(reward.value)) {
          run.runFlags.push(reward.value);
        }
        break;

      case 'cargo':
        run.ship.cargo.push(reward.value);
        GameState.addLog('event', `Acquired cargo: ${reward.description || reward.value}`);
        break;

      case 'lore_fragment':
        GameState.addLog('discovery', reward.description || `Lore fragment: ${reward.value}`);
        break;

      case 'unlock_hint':
        // Dev/internal only — no player-facing effect
        break;
    }
  },

  // ─── Placeholder event for empty pools ────────────────────

  _placeholderEvent() {
    return {
      id: 'PLACEHOLDER',
      node_type: 'unknown',
      setup_text: 'Nothing of interest here. You move on.',
      steps: [{
        step_number: 1,
        condition: null,
        setup_text: '',
        options: [{
          label: 'Continue.',
          check_type: 'none',
          requires_crew_role: null,
          requires_module: null,
          requires_rep: null,
          requires_flag: null,
          requires_ability: null,
          locked_hint: '',
          difficulty: 'medium',
          outcomes: {
            success: {
              level: 'success',
              narrative: 'You continue on.',
              rewards: [],
              sets_flag: null,
              clears_flag: null,
              morale_delta: 0,
              loyalty_delta: 0,
              hull_delta: 0,
              resonance_delta: 0,
            },
            partial: null,
            failure: null,
          },
        }],
      }],
    };
  },
};
