/* Void Meridian — Crew Interaction UI */

const InteractionUI = {

  // Trait colors for speaker names
  TRAIT_COLORS: {
    reckless:   '#e8634a',
    stoic:      '#7a8b99',
    vocal:      '#d4a843',
    curious:    '#5cc4e6',
    haunted:    '#8b6bb5',
    pragmatic:  '#6b9b6b',
    idealistic: '#c4829b',
  },

  TYPE_LABELS: {
    event_reaction:    'CREW REACTION',
    crew_to_crew:      'CREW TALK',
    captain_one_on_one: 'PRIVATE CONVERSATION',
  },

  TYPE_COLORS: {
    event_reaction:    'var(--text-secondary)',
    crew_to_crew:      'var(--text-muted)',
    captain_one_on_one: 'var(--text-accent)',
  },

  // ─── Main render ─────────────────────────────────────────────

  render(container) {
    const interaction = GameState.run.activeInteraction;
    if (!interaction) return;

    const screen = document.createElement('div');
    screen.className = 'screen';

    // If resolved (player chose option), show outcome
    if (GameState.run.interactionResolved && interaction._selectedOption) {
      this._renderResolved(screen, interaction);
    } else if (!interaction.captain_options || interaction.captain_options.length === 0) {
      // Passive interaction — show dialogue + continue
      this._renderPassive(screen, interaction);
    } else {
      // Active interaction — show dialogue + captain options
      this._renderActive(screen, interaction);
    }

    container.appendChild(screen);
  },

  // ─── Passive (no player choice needed) ───────────────────────

  _renderPassive(screen, interaction) {
    this._renderHeader(screen, interaction);
    this._renderPersonalitySubheader(screen, interaction);
    this._renderDialogue(screen, interaction);

    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn-confirm';
    continueBtn.style.marginTop = 'var(--space-md)';
    continueBtn.textContent = 'CONTINUE';
    continueBtn.addEventListener('click', () => InteractionEngine.finishInteraction());
    screen.appendChild(continueBtn);
  },

  // ─── Active (captain must choose) ────────────────────────────

  _renderActive(screen, interaction) {
    this._renderHeader(screen, interaction);
    this._renderPersonalitySubheader(screen, interaction);
    this._renderDialogue(screen, interaction);

    // Captain divider for crew_to_crew mediation
    if (interaction.type === 'crew_to_crew') {
      const divider = document.createElement('div');
      divider.style.cssText = 'text-align:center; color:var(--text-muted); font-size:var(--font-size-sm); text-transform:uppercase; letter-spacing:0.1em; margin:var(--space-md) 0 var(--space-sm); border-top:1px solid var(--border); padding-top:var(--space-sm);';
      divider.textContent = '⚑ CAPTAIN';
      screen.appendChild(divider);
    } else {
      const divider = document.createElement('hr');
      divider.className = 'divider';
      screen.appendChild(divider);
    }

    // Captain options
    for (let i = 0; i < interaction.captain_options.length; i++) {
      const option = interaction.captain_options[i];
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = option.label;
      const idx = i;
      btn.addEventListener('click', () => InteractionEngine.selectOption(idx));
      screen.appendChild(btn);
    }
  },

  // ─── Resolved (outcome shown) ────────────────────────────────

  _renderResolved(screen, interaction) {
    this._renderHeader(screen, interaction);

    // Show the choice made
    const selectedOption = interaction._selectedOption;
    if (selectedOption && selectedOption.label) {
      const choiceEl = document.createElement('div');
      choiceEl.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); margin-bottom:var(--space-sm); text-transform:uppercase;';
      choiceEl.textContent = `▸ ${selectedOption.label}`;
      screen.appendChild(choiceEl);
    }

    // Outcome narrative
    if (selectedOption && selectedOption.outcome && selectedOption.outcome.narrative) {
      const narrativeEl = document.createElement('div');
      narrativeEl.className = 'narrative';
      narrativeEl.innerHTML = EventUI._colorizeNarrative(
        InteractionEngine._resolveTokens(selectedOption.outcome.narrative)
      );
      screen.appendChild(narrativeEl);
    }

    // Effects summary
    const effects = this._summarizeOutcome(selectedOption ? selectedOption.outcome : null, interaction);
    if (effects.length > 0) {
      const effectsEl = document.createElement('div');
      effectsEl.style.cssText = 'margin-top:var(--space-sm); color:var(--text-muted); font-size:var(--font-size-sm);';
      effectsEl.innerHTML = effects.join('<br>');
      screen.appendChild(effectsEl);
    }

    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn-confirm';
    continueBtn.style.marginTop = 'var(--space-md)';
    continueBtn.textContent = 'CONTINUE';
    continueBtn.addEventListener('click', () => InteractionEngine.finishInteraction());
    screen.appendChild(continueBtn);
  },

  // ─── Header ──────────────────────────────────────────────────

  _renderHeader(screen, interaction) {
    const header = document.createElement('div');
    header.className = 'system-label';
    header.style.cssText = `margin-bottom:var(--space-sm); color:${this.TYPE_COLORS[interaction.type] || 'var(--text-secondary)'};`;
    header.textContent = this.TYPE_LABELS[interaction.type] || 'CREW INTERACTION';
    screen.appendChild(header);
  },

  // ─── Personality subheader (Type C only) ─────────────────────

  _renderPersonalitySubheader(screen, interaction) {
    if (interaction.type !== 'captain_one_on_one') return;
    if (!interaction.requires_crew || interaction.requires_crew.length === 0) return;

    const member = GameState.run.crew.find(c => c.id === interaction.requires_crew[0] && !c.dead);
    if (!member || !member.personalityDescription) return;

    const desc = document.createElement('div');
    desc.style.cssText = 'color:var(--text-muted); font-size:var(--font-size-sm); font-style:italic; margin-bottom:var(--space-md); line-height:1.4;';
    desc.textContent = member.personalityDescription;
    screen.appendChild(desc);
  },

  // ─── Dialogue lines ─────────────────────────────────────────

  _renderDialogue(screen, interaction) {
    if (!interaction.dialogue || interaction.dialogue.length === 0) return;

    const dialogueArea = document.createElement('div');
    dialogueArea.style.cssText = 'margin-bottom:var(--space-sm);';

    let prevSpeakerId = null;
    for (let i = 0; i < interaction.dialogue.length; i++) {
      const line = interaction.dialogue[i];
      const speaker = InteractionEngine._resolveSpeaker(line.speaker);
      const isNewSpeaker = line.speaker !== prevSpeakerId;
      prevSpeakerId = line.speaker;

      const lineEl = document.createElement('div');

      // Alternating indent for crew-to-crew
      if (interaction.type === 'crew_to_crew' && i > 0) {
        const isSecondSpeaker = line.speaker !== interaction.dialogue[0].speaker;
        if (isSecondSpeaker) {
          lineEl.style.marginLeft = '2em';
        }
      }

      lineEl.style.cssText += 'margin-bottom:var(--space-sm); line-height:1.5;';

      // Speaker name (only show when speaker changes)
      if (isNewSpeaker) {
        const nameEl = document.createElement('div');
        const traitColor = this.TRAIT_COLORS[speaker.personality] || 'var(--text-accent)';
        nameEl.style.cssText = `color:${traitColor}; font-size:var(--font-size-sm); font-weight:bold; margin-bottom:2px;`;
        nameEl.textContent = `${speaker.emoji || '◻'} ${speaker.name}`;
        lineEl.appendChild(nameEl);
      }

      // Dialogue text
      const textEl = document.createElement('div');
      textEl.style.cssText = 'color:var(--text-primary); padding-left:var(--space-sm);';
      // Type A gets left border accent
      if (interaction.type === 'event_reaction') {
        textEl.style.cssText += 'border-left:2px solid var(--border); padding-left:var(--space-md);';
      }
      textEl.innerHTML = EventUI._colorizeNarrative(
        InteractionEngine._resolveTokens(line.text)
      );
      lineEl.appendChild(textEl);

      dialogueArea.appendChild(lineEl);
    }

    screen.appendChild(dialogueArea);
  },

  // ─── Effects summary ─────────────────────────────────────────

  _summarizeOutcome(outcome, interaction) {
    const effects = [];
    if (!outcome) return effects;

    if (outcome.loyalty_delta) {
      for (const [crewId, delta] of Object.entries(outcome.loyalty_delta)) {
        const name = crewId === 'all' ? 'All crew' :
          (GameState.run.crew.find(c => c.id === crewId)?.name || crewId);
        if (delta > 0) effects.push(`${name}: Loyalty +${delta}`);
        if (delta < 0) effects.push(`${name}: Loyalty ${delta}`);
      }
    }

    if (outcome.morale_delta) {
      for (const [crewId, delta] of Object.entries(outcome.morale_delta)) {
        const name = crewId === 'all' ? 'All crew' :
          (GameState.run.crew.find(c => c.id === crewId)?.name || crewId);
        if (delta > 0) effects.push(`${name}: Morale +${delta}`);
        if (delta < 0) effects.push(`${name}: Morale ${delta}`);
      }
    }

    if (outcome.resonance_delta) {
      effects.push(`Resonance ${outcome.resonance_delta > 0 ? '+' : ''}${outcome.resonance_delta}`);
    }

    return effects;
  },
};
