/* Void Meridian — Crew Interaction Engine */

const InteractionEngine = {
  _interactionLibrary: [],
  _profileLibrary: {},

  // ─── Initialization ──────────────────────────────────────────

  init(data) {
    if (!data) return;
    this._interactionLibrary = data.interactions || [];
    this._profileLibrary = data.personality_profiles || {};
  },

  // ─── Check for interaction after event ───────────────────────

  checkForInteraction(completedEvent, outcomeLevel) {
    const eligible = this._getEligibleInteractions(completedEvent, outcomeLevel);
    if (eligible.length === 0) return null;

    const run = GameState.run;

    // Cooldown: skip if last interaction was < 2 nodes ago
    // unless best candidate has priority >= 8 (critical story)
    const bestPriority = Math.max(...eligible.map(i => i.priority || 5));
    if (run.lastInteractionDepth >= 0 &&
        run.depth - run.lastInteractionDepth < 2 &&
        bestPriority < 8) {
      return null;
    }

    // Probability gate: base 40% + 5% per intuition stat
    const intuition = run.captain.stats.intuition || 1;
    const chance = 0.40 + (intuition - 1) * 0.05;
    if (bestPriority < 8 && Math.random() > chance) return null;

    return this._weightedSelect(eligible, completedEvent);
  },

  // ─── Filter eligible interactions ────────────────────────────

  _getEligibleInteractions(completedEvent, outcomeLevel) {
    const run = GameState.run;
    const maxDepth = run.map ? run.map.maxDepth : 30;
    const depthZone = Registry._getDepthZone(run.depth, maxDepth);
    const livingCrew = run.crew.filter(c => !c.dead);

    return this._interactionLibrary.filter(int => {
      // Already seen (non-repeatable)
      if (!int.repeatable && run.seenInteractionIds.includes(int.id)) return false;

      // Flag gating
      if (int.requires_flags && int.requires_flags.length > 0) {
        if (!int.requires_flags.every(f => run.runFlags.includes(f))) return false;
      }
      if (int.excludes_flags && int.excludes_flags.length > 0) {
        if (int.excludes_flags.some(f => run.runFlags.includes(f))) return false;
      }

      // Depth zone
      if (int.depth_zone && int.depth_zone !== 'any') {
        if (int.depth_zone !== depthZone) return false;
      }

      // Required specific crew (must all be alive)
      if (int.requires_crew && int.requires_crew.length > 0) {
        for (const crewId of int.requires_crew) {
          if (!livingCrew.some(c => c.id === crewId)) return false;
        }
      }

      // Required traits — for crew_to_crew, ALL listed traits must be represented
      // by at least one unique crew member each. For other types, any match suffices.
      if (int.requires_any_trait && int.requires_any_trait.length > 0) {
        if (int.type === 'crew_to_crew') {
          // Each trait needs a distinct crew member
          const availableCrew = [...livingCrew];
          for (const trait of int.requires_any_trait) {
            const idx = availableCrew.findIndex(c => c.personality === trait);
            if (idx === -1) return false;
            availableCrew.splice(idx, 1); // remove so same crew can't satisfy two traits
          }
        } else {
          if (!livingCrew.some(c => int.requires_any_trait.includes(c.personality))) return false;
        }
      }

      // Event tag match (for event_reaction type)
      if (int.requires_event_tags && int.requires_event_tags.length > 0) {
        const eventTags = completedEvent.tags || [];
        const eventFaction = completedEvent.faction_context || 'none';
        const eventType = completedEvent.node_type || '';
        // Check if any required tag is in event tags, faction, or node type
        const hasMatch = int.requires_event_tags.some(tag =>
          eventTags.includes(tag) ||
          eventFaction === tag ||
          eventType === tag ||
          eventType.includes(tag)
        );
        if (!hasMatch) return false;
      }

      // Outcome level match
      if (int.requires_outcome_level && int.requires_outcome_level !== outcomeLevel) return false;

      // Loyalty/morale thresholds — check against first required crew, or any crew if generic
      const thresholdTarget = (int.requires_crew && int.requires_crew.length > 0)
        ? livingCrew.find(c => c.id === int.requires_crew[0])
        : null;

      if (int.min_loyalty != null) {
        if (thresholdTarget) {
          if (thresholdTarget.loyalty < int.min_loyalty) return false;
        } else {
          if (!livingCrew.some(c => c.loyalty >= int.min_loyalty)) return false;
        }
      }
      if (int.max_loyalty != null) {
        if (thresholdTarget) {
          if (thresholdTarget.loyalty > int.max_loyalty) return false;
        } else {
          if (!livingCrew.some(c => c.loyalty <= int.max_loyalty)) return false;
        }
      }
      if (int.min_morale != null) {
        if (thresholdTarget) {
          if (thresholdTarget.morale < int.min_morale) return false;
        } else {
          if (!livingCrew.some(c => c.morale >= int.min_morale)) return false;
        }
      }
      if (int.max_morale != null) {
        if (thresholdTarget) {
          if (thresholdTarget.morale > int.max_morale) return false;
        } else {
          if (!livingCrew.some(c => c.morale <= int.max_morale)) return false;
        }
      }

      return true;
    });
  },

  // ─── Weighted selection ──────────────────────────────────────

  _weightedSelect(eligible, completedEvent) {
    const livingCrew = GameState.run.crew.filter(c => !c.dead);
    const eventFaction = completedEvent.faction_context || 'none';

    const weighted = eligible.map(int => {
      let weight = int.priority || 5;

      // 2x bonus for Type A when event faction matches crew faction affiliation
      if (int.type === 'event_reaction' && eventFaction !== 'none') {
        if (int.requires_crew && int.requires_crew.length > 0) {
          const member = livingCrew.find(c => c.id === int.requires_crew[0]);
          if (member && member.factionAffiliation === eventFaction) {
            weight *= 2;
          }
        }
      }

      return { interaction: int, weight };
    });

    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const w of weighted) {
      roll -= w.weight;
      if (roll <= 0) return JSON.parse(JSON.stringify(w.interaction));
    }
    return JSON.parse(JSON.stringify(weighted[weighted.length - 1].interaction));
  },

  // ─── Player selects a captain option ─────────────────────────

  selectOption(optionIndex) {
    const interaction = GameState.run.activeInteraction;
    if (!interaction || !interaction.captain_options) return;
    if (optionIndex >= interaction.captain_options.length) return;

    const option = interaction.captain_options[optionIndex];
    interaction._selectedOption = option;
    interaction._selectedIndex = optionIndex;
    GameState.run.interactionResolved = true;

    this._applyOutcome(option.outcome);
    GameState.save();
    Game.render();
  },

  // ─── Apply interaction outcome ───────────────────────────────

  _applyOutcome(outcome) {
    if (!outcome) return;
    const run = GameState.run;

    // Targeted loyalty deltas
    if (outcome.loyalty_delta) {
      for (const [crewId, delta] of Object.entries(outcome.loyalty_delta)) {
        if (crewId === 'all') {
          for (const member of run.crew) {
            if (!member.dead) CrewEngine.adjustLoyalty(member, delta);
          }
        } else {
          const member = run.crew.find(c => c.id === crewId);
          if (member && !member.dead) CrewEngine.adjustLoyalty(member, delta);
        }
      }
    }

    // Targeted morale deltas
    if (outcome.morale_delta) {
      for (const [crewId, delta] of Object.entries(outcome.morale_delta)) {
        if (crewId === 'all') {
          CrewEngine.adjustMoraleAll(delta);
        } else {
          const member = run.crew.find(c => c.id === crewId);
          if (member && !member.dead) {
            member.morale = Math.max(0, Math.min(100, member.morale + delta));
          }
        }
      }
    }

    // Set flag
    if (outcome.sets_flag) {
      if (!run.runFlags.includes(outcome.sets_flag)) {
        run.runFlags.push(outcome.sets_flag);
      }
    }

    // Resonance delta
    if (outcome.resonance_delta) {
      GameState.meta.resonance += outcome.resonance_delta;
    }
  },

  // ─── Finish interaction and transition ───────────────────────

  finishInteraction() {
    GameState.run.activeInteraction = null;
    GameState.run.interactionResolved = false;

    // Check for hull death
    if (GameState.run.ship.hull <= 0) {
      GameState.endRun('hull_destroyed');
      NexusEngine.accumulateRunResonance();
      GameState.screen = 'gameOver';
    } else if (GameState.run.atDepot) {
      DepotUI.subScreen = 'menu';
      GameState.screen = 'map';
      Tabs.activeTab = 'event';
    } else {
      Tabs.switchTo('map');
    }

    GameState.save();
    Game.render();
  },

  // ─── Token replacement ───────────────────────────────────────

  _resolveTokens(text) {
    if (!text) return '';
    const captainName = GameState.run.captain.name || 'Captain';
    return text.replace(/\{captain\}/g, captainName);
  },

  // ─── Resolve speaker ID to crew member ───────────────────────

  _resolveSpeaker(speakerId) {
    if (speakerId === 'captain') {
      return {
        name: GameState.run.captain.name || 'Captain',
        emoji: '⚑',
        personality: null,
        role: 'captain',
        _isCaptain: true,
      };
    }

    // Generic trait-based speaker: "any_reckless", "any_stoic", etc.
    if (speakerId.startsWith('any_')) {
      const trait = speakerId.substring(4);
      const living = GameState.run.crew.filter(c => !c.dead && c.personality === trait);
      if (living.length > 0) {
        return living[Math.floor(Math.random() * living.length)];
      }
      // Fallback: any living crew
      const allLiving = GameState.run.crew.filter(c => !c.dead);
      if (allLiving.length > 0) return allLiving[0];
      return { name: 'Crew', emoji: '◻', personality: trait, role: 'unknown' };
    }

    // Specific crew ID
    const member = GameState.run.crew.find(c => c.id === speakerId && !c.dead);
    if (member) return member;

    return { name: speakerId, emoji: '◻', personality: null, role: 'unknown' };
  },
};
