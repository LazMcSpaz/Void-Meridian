/* Void Meridian — Event Resolution Engine (events_master.json schema) */

const EventEngine = {

  // ─── Trigger an event at a map node ────────────────────────

  // Tier preference weights by depth zone
  _TIER_WEIGHTS: {
    early: { 1: 5, 2: 2, 3: 0 },
    mid:   { 1: 1, 2: 5, 3: 2 },
    late:  { 1: 0, 2: 2, 3: 5 },
  },

  _weightedPick(candidates, depthZone) {
    const tierWeights = this._TIER_WEIGHTS[depthZone] || { 1: 1, 2: 1, 3: 1 };
    const weighted = candidates.map(evt => {
      const tier = evt.complexity_tier || 2;
      let weight = tierWeights[tier] || 1;
      // Non-repeatable events get 3x priority over repeatable
      if (!evt.repeatable) weight *= 3;
      return { event: evt, weight };
    });
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    if (totalWeight <= 0) return candidates[Math.floor(Math.random() * candidates.length)];
    let roll = Math.random() * totalWeight;
    for (const w of weighted) {
      roll -= w.weight;
      if (roll <= 0) return w.event;
    }
    return weighted[weighted.length - 1].event;
  },

  triggerNodeEvent(node) {
    const factionContext = node.faction || 'none';
    const run = GameState.run;
    const maxDepth = run.map ? run.map.maxDepth : 30;
    const depthZone = Registry._getDepthZone(run.depth, maxDepth);
    const eligible = Registry.getEligibleEvents(node.type, factionContext);

    let event;
    if (eligible.length > 0) {
      // Tier-weighted selection
      event = this._weightedPick(eligible, depthZone);
      event = JSON.parse(JSON.stringify(event)); // deep clone
    } else {
      // Relaxed fallback level 1: ignore depth_zone, keep tier weights
      const relaxed = (Registry.eventsByType[node.type] || []).filter(evt => {
        if (evt.faction_context && evt.faction_context !== 'none' && evt.faction_context !== factionContext) return false;
        if ((evt.min_resonance || 0) > GameState.meta.resonance) return false;
        if (evt.requires_flags && evt.requires_flags.length > 0) {
          if (!evt.requires_flags.every(f => run.runFlags.includes(f))) return false;
        }
        if (!evt.repeatable && run.seenEventIds && run.seenEventIds.includes(evt.id)) return false;
        return true;
      });
      if (relaxed.length > 0) {
        event = JSON.parse(JSON.stringify(this._weightedPick(relaxed, depthZone)));
      } else {
        // Relaxed fallback level 2: ignore tier weights (uniform random)
        const anyLeft = (Registry.eventsByType[node.type] || []).filter(evt => {
          if (evt.faction_context && evt.faction_context !== 'none' && evt.faction_context !== factionContext) return false;
          if ((evt.min_resonance || 0) > GameState.meta.resonance) return false;
          if (evt.requires_flags && evt.requires_flags.length > 0) {
            if (!evt.requires_flags.every(f => run.runFlags.includes(f))) return false;
          }
          if (!evt.repeatable && run.seenEventIds && run.seenEventIds.includes(evt.id)) return false;
          return true;
        });
        if (anyLeft.length > 0) {
          event = JSON.parse(JSON.stringify(anyLeft[Math.floor(Math.random() * anyLeft.length)]));
        } else {
          event = this._placeholderEvent();
        }
      }
    }

    // Apply variant text for repeatable events
    if (event.variants && event.variants.length > 0) {
      const variant = event.variants[Math.floor(Math.random() * event.variants.length)];
      if (variant.setup_text) event.setup_text = variant.setup_text;
      if (variant.title) event.title = variant.title;
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
      const reqMod = option.requires_module;
      if (!run.ship.equippedModules.some(m => m.id === reqMod || m.id === 'mod_' + reqMod)) {
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

    // Named crew passive: options requiring a specific named crew member
    if (option.requires_named_crew) {
      if (!CrewEngine.hasNamedCrew(option.requires_named_crew)) {
        return { available: false, hint: option.locked_hint || `Requires ${option.requires_named_crew}` };
      }
    }

    // Skill checks targeting a crew role require that role aboard
    if (option.check_type === 'skill' && option.check_target) {
      const role = option.check_target;
      const roles = ['pilot', 'soldier', 'technician', 'medic', 'engineer', 'diplomat'];
      if (roles.includes(role) && !run.crew.some(c => !c.dead && c.role === role)) {
        return { available: false, hint: `Requires ${role}` };
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
        // Command stat: crew effectiveness bonus (+3 per command level above 1)
        const command = (run.captain.stats && run.captain.stats.command) || 1;
        skillValue += (command - 1) * 3;
        // Morale modifier: (morale - 50) * 0.2 gives -10 to +10
        skillValue += (crewMember.morale - 50) * 0.2;
        // Condition penalty: shaken crew perform worse
        // Rook passive: wounded crew can still act at reduced capacity (-5 instead of -10)
        if (crewMember.conditions && crewMember.conditions.some(
          c => (typeof c === 'string' ? c : c.name) === 'shaken'
        )) {
          skillValue -= CrewEngine.hasNamedCrew('rook') ? 5 : 10;
        }
        // Tam passive: +15% success rate on hacking/technical options
        if (option.check_target === 'technician' && CrewEngine.hasNamedCrew('tam')) {
          skillValue += 15;
        }
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
      // Captain ability bonus: +10 if captain has a matching ability
      const abilityStats = { rally_cry: 'command', gut_feeling: 'intuition', iron_will: 'resolve', scavenger_eye: 'intuition' };
      for (const ab of run.captain.abilities) {
        if (abilityStats[ab] === option.check_target) {
          skillValue += 10;
          break;
        }
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

    const effectiveOutcome = outcome || option.outcomes.success;
    let combatInitiated = false;
    if (effectiveOutcome) {
      combatInitiated = this._applyOutcome(effectiveOutcome, event);
    }

    // Store step outcome for conditional branching
    GameState.run.lastStepOutcomes[step.step_number] = outcomeLevel;

    // Store for UI display
    event._lastOutcome = effectiveOutcome;
    event._lastOutcomeLevel = outcomeLevel;
    event._lastChoiceLabel = option.label;

    GameState.addLog('event', `Chose: "${option.label}" → ${outcomeLevel}`);

    // If combat was initiated, don't mark resolved — combat screen takes over
    if (combatInitiated) {
      GameState.save();
      return;
    }

    event._resolved = true;
    GameState.save();
    Game.render();
  },

  // ─── Advance to next step or finish event ─────────────────

  advanceEvent() {
    const event = GameState.run.activeEvent;
    if (!event) return;

    // If returning from combat, set result flags for step conditions
    if (GameState.run.lastCombatResult) {
      const result = GameState.run.lastCombatResult;
      const flags = GameState.run.runFlags;
      // Clear any prior combat flags
      const combatFlags = ['combat_destroyed', 'combat_disabled', 'combat_fled', 'combat_surrendered'];
      for (const f of combatFlags) {
        const idx = flags.indexOf(f);
        if (idx !== -1) flags.splice(idx, 1);
      }
      // Set the current result flag
      if (result === 'victory_destroyed' && !flags.includes('combat_destroyed')) {
        flags.push('combat_destroyed');
      } else if (result === 'victory_disabled' && !flags.includes('combat_disabled')) {
        flags.push('combat_disabled');
      } else if (result === 'fled' && !flags.includes('combat_fled')) {
        flags.push('combat_fled');
      } else if (result === 'surrendered' && !flags.includes('combat_surrendered')) {
        flags.push('combat_surrendered');
      }
      GameState.run.lastCombatResult = null;
    }

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
    // Flag-based condition: step only appears if a run flag is set
    if (step.condition.requires_flag) {
      if (!GameState.run.runFlags.includes(step.condition.requires_flag)) return false;
    }
    // Multiple flags: all must be set
    if (step.condition.requires_flags) {
      for (const flag of step.condition.requires_flags) {
        if (!GameState.run.runFlags.includes(flag)) return false;
      }
    }
    // Exclude flag(s): step is skipped if any exclude flag is set
    if (step.condition.excludes_flag) {
      if (GameState.run.runFlags.includes(step.condition.excludes_flag)) return false;
    }
    if (step.condition.excludes_flags) {
      for (const flag of step.condition.excludes_flags) {
        if (GameState.run.runFlags.includes(flag)) return false;
      }
    }
    // Prior step outcome condition
    if (step.condition.prior_step != null && step.condition.outcome) {
      const priorOutcome = GameState.run.lastStepOutcomes[step.condition.prior_step];
      if (priorOutcome !== step.condition.outcome) return false;
    }
    return true;
  },

  _getCurrentStep(event, stepIdx) {
    if (!event.steps || stepIdx >= event.steps.length) return null;
    return event.steps[stepIdx];
  },

  _finishEvent(event) {
    // Mark event as seen (repeatable events skip this)
    if (event.id && event.id !== 'PLACEHOLDER' && !event.repeatable) {
      if (!GameState.run.seenEventIds.includes(event.id)) {
        GameState.run.seenEventIds.push(event.id);
      }
    }

    // Check for crew interaction trigger before clearing event state
    if (typeof InteractionEngine !== 'undefined') {
      const interaction = InteractionEngine.checkForInteraction(
        event, event._lastOutcomeLevel || 'success'
      );

      if (interaction) {
        GameState.run.activeInteraction = interaction;
        GameState.run.interactionResolved = false;
        GameState.run.lastInteractionDepth = GameState.run.depth;
        if (!interaction.repeatable) {
          GameState.run.seenInteractionIds.push(interaction.id);
        }
        // Clear event state but don't transition screens
        GameState.run.activeEvent = null;
        GameState.run.activeEventStep = 0;
        GameState.run.lastStepOutcomes = {};
        CrewEngine.tickAfterEvent();
        ShipEngine.updateVisualStage();
        GameState.save();
        Game.render();
        return; // InteractionUI takes over
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
    } else if (GameState.run.atDepot) {
      // Return to depot docking menu after event
      DepotUI.subScreen = 'menu';
      GameState.screen = 'map';
      Tabs.activeTab = 'event';
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
    // Resolve stat: reduces negative morale impact by 20% per level above 1
    if (outcome.morale_delta) {
      let moraleDelta = outcome.morale_delta;
      if (moraleDelta < 0) {
        const resolve = (GameState.run.captain.stats && GameState.run.captain.stats.resolve) || 1;
        moraleDelta = Math.round(moraleDelta * Math.max(0.4, 1 - (resolve - 1) * 0.2));
      }
      CrewEngine.adjustMoraleAll(moraleDelta);
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

    // 9. Initiate combat if specified
    if (outcome.initiates_combat) {
      CombatEngine.startCombat(outcome.initiates_combat, true);
      return true; // signal that combat was initiated
    }

    return false;
  },

  _processReward(reward) {
    const run = GameState.run;

    // Scavenger's Eye: +25% credits/fuel gains at derelict nodes
    const scavengerBonus = run.captain.abilities.includes('scavenger_eye') &&
      run.activeEvent && run.activeEvent.node_type === 'derelict' && reward.value > 0;
    // Dorin passive: identifies salvageable components in derelicts (+15% credits/fuel)
    const dorinBonus = run.activeEvent && run.activeEvent.node_type === 'derelict' &&
      reward.value > 0 && CrewEngine.hasNamedCrew('dorin');

    switch (reward.type) {
      case 'credits': {
        let val = reward.value;
        if (scavengerBonus) val = Math.round(val * 1.25);
        if (dorinBonus) val = Math.round(val * 1.15);
        run.credits = Math.max(0, run.credits + val);
        const creditTag = scavengerBonus ? ' (Scavenger\'s Eye)' : dorinBonus ? ' (Dorin)' : '';
        if (val > 0) GameState.addLog('event', `Gained ${val} credits` + creditTag);
        else if (val < 0) GameState.addLog('event', `Lost ${Math.abs(val)} credits`);
        break;
      }

      case 'fuel': {
        let val = reward.value;
        if (scavengerBonus) val = Math.round(val * 1.25);
        if (dorinBonus) val = Math.round(val * 1.15);
        run.fuel = Math.max(0, run.fuel + val);
        const fuelTag = scavengerBonus ? ' (Scavenger\'s Eye)' : dorinBonus ? ' (Dorin)' : '';
        if (val > 0) GameState.addLog('event', `Gained ${val} fuel` + fuelTag);
        else if (val < 0) GameState.addLog('event', `Lost ${Math.abs(val)} fuel`);
        break;
      }

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
        if (ShipEngine.isCargoFull()) {
          GameState.addLog('event', `Cargo hold full — could not store: ${reward.description || reward.value}`);
        } else {
          run.ship.cargo.push(reward.value);
          GameState.addLog('event', `Acquired cargo: ${reward.description || reward.value} (${run.ship.cargo.length}/${ShipEngine.getCargoCapacity()})`);
        }
        break;

      case 'lore_fragment':
        if (!run.loreFragments.some(lf => lf.id === reward.value)) {
          run.loreFragments.push({
            id: reward.value,
            description: reward.description || reward.value,
            depth: run.depth,
          });
        }
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
