/* Void Meridian — Crew Tab Renderer */

const CrewUI = {
  expandedCrewId: null,

  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = `CREW (${GameState.run.crew.filter(c => !c.dead).length})`;
    screen.appendChild(header);

    const alive = GameState.run.crew.filter(c => !c.dead);
    if (alive.length === 0) {
      const empty = document.createElement('p');
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'No crew aboard.';
      screen.appendChild(empty);
      container.appendChild(screen);
      return;
    }

    for (const member of alive) {
      screen.appendChild(this._renderCard(member));
    }

    // Dead crew at bottom (grayed)
    const dead = GameState.run.crew.filter(c => c.dead);
    if (dead.length > 0) {
      const deadHeader = document.createElement('div');
      deadHeader.className = 'system-label';
      deadHeader.style.cssText = 'margin-top:var(--space-lg); color:var(--text-muted);';
      deadHeader.textContent = 'LOST';
      screen.appendChild(deadHeader);
      for (const member of dead) {
        screen.appendChild(this._renderDeadCard(member));
      }
    }

    container.appendChild(screen);
  },

  _renderCard(member) {
    const card = document.createElement('div');
    card.className = 'crew-card';
    const isExpanded = this.expandedCrewId === member.id;

    // Role emoji — named characters use their own emoji or special treatment
    const emoji = member.emoji || this._roleEmoji(member.role);

    // Header row: named chars show full name, common show first name only
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex; justify-content:space-between; align-items:baseline;';
    const displayName = member.isNamed ? member.name : member.name.split(' ')[0];
    nameRow.innerHTML = `
      <span class="crew-name">${emoji} ${displayName}</span>
      <span class="crew-role">${member.role}${member.isNamed ? ' ★' : ''}</span>
    `;
    card.appendChild(nameRow);

    // Trait
    if (member.trait) {
      const trait = document.createElement('div');
      trait.className = 'crew-trait';
      trait.textContent = member.trait;
      card.appendChild(trait);
    }

    // Stats
    const stats = document.createElement('div');
    stats.className = 'crew-stats';
    stats.appendChild(this._miniBar('MRL', member.morale || 50, member.morale <= 25 ? 'danger' : member.morale <= 50 ? 'warning' : ''));

    // Secret loyalty: hide above 79 for named chars until revealed
    if (member.isNamed && member.loyalty >= 80 && !member.secretRevealed) {
      stats.appendChild(this._miniBar('LYL', 79, '', '???'));
    } else {
      stats.appendChild(this._miniBar('LYL', member.loyalty || 50, member.loyalty <= 25 ? 'danger' : ''));
    }
    card.appendChild(stats);

    // Conditions
    if (member.conditions && member.conditions.length > 0 && member.conditions[0] !== 'dead') {
      const condRow = document.createElement('div');
      condRow.style.marginTop = 'var(--space-xs)';
      for (const cond of member.conditions) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-warning';
        badge.textContent = `[${cond.toUpperCase().substring(0, 3)}]`;
        badge.style.marginRight = 'var(--space-xs)';
        condRow.appendChild(badge);
      }
      card.appendChild(condRow);
    }

    // Expanded details
    if (isExpanded) {
      const details = document.createElement('div');
      details.style.cssText = 'margin-top:var(--space-sm); padding-top:var(--space-sm); border-top:1px solid var(--border);';

      // Named character personality description
      if (member.isNamed && member.personalityDescription) {
        const bio = document.createElement('div');
        bio.style.cssText = 'color:var(--text-secondary); font-size:var(--font-size-sm); margin-bottom:var(--space-sm); font-style:italic;';
        bio.textContent = member.personalityDescription;
        details.appendChild(bio);
      }

      // Unique passive
      if (member.uniquePassive) {
        const passive = document.createElement('div');
        passive.style.cssText = 'color:var(--color-nexus); font-size:var(--font-size-sm); margin-bottom:var(--space-sm);';
        passive.textContent = `◈ ${member.uniquePassive}`;
        details.appendChild(passive);
      }

      // Combat stats
      if (member.combatStats) {
        const combat = document.createElement('div');
        combat.style.cssText = 'font-size:var(--font-size-sm); color:var(--text-secondary);';
        combat.textContent = `ATK ${member.combatStats.atk_modifier >= 0 ? '+' : ''}${member.combatStats.atk_modifier} / DEF ${member.combatStats.def_modifier >= 0 ? '+' : ''}${member.combatStats.def_modifier}`;
        details.appendChild(combat);
      }

      // Relationships
      if (member.relationships && member.relationships.length > 0) {
        const relHeader = document.createElement('div');
        relHeader.className = 'system-label';
        relHeader.style.marginTop = 'var(--space-sm)';
        relHeader.textContent = 'RELATIONSHIPS';
        details.appendChild(relHeader);
        for (const rel of member.relationships) {
          const relEl = document.createElement('div');
          relEl.style.cssText = 'font-size:var(--font-size-sm); color:var(--text-secondary);';
          relEl.textContent = `${rel.target}: ${rel.type} (${rel.value > 0 ? '+' : ''}${rel.value})`;
          details.appendChild(relEl);
        }
      }

      card.appendChild(details);
    }

    card.addEventListener('click', () => {
      this.expandedCrewId = isExpanded ? null : member.id;
      Game.render();
    });

    return card;
  },

  _renderDeadCard(member) {
    const card = document.createElement('div');
    card.className = 'crew-card';
    card.style.opacity = '0.4';

    const emoji = member.emoji || this._roleEmoji(member.role);
    const displayName = member.isNamed ? member.name : member.name.split(' ')[0];

    card.innerHTML = `
      <span style="text-decoration:line-through; color:var(--text-muted);">${emoji} ${displayName}</span>
      <span class="crew-role" style="color:var(--text-muted);">${member.role}</span>
    `;
    return card;
  },

  _roleEmoji(role) {
    const emojis = {
      engineer: '🔧',
      pilot: '🚀',
      medic: '💉',
      soldier: '⚔',
      technician: '💻',
      diplomat: '🤝',
      scientist: '🔬',
    };
    return emojis[role] || '👤';
  },

  _miniBar(label, value, variant, suffix) {
    const pct = Math.max(0, Math.min(100, value));
    const filled = Math.round(pct / 10);
    const empty = 10 - filled;
    const el = document.createElement('div');
    el.className = 'stat-bar' + (variant ? ` ${variant}` : '');
    el.style.fontSize = 'var(--font-size-sm)';
    el.innerHTML = `${label} <span class="stat-bar-fill">${'█'.repeat(filled)}</span><span class="stat-bar-empty">${'░'.repeat(empty)}</span> ${suffix || pct}`;
    return el;
  },
};
