/* Void Meridian — Log Tab Renderer */

const LogUI = {
  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = 'RUN LOG';
    screen.appendChild(header);

    const entries = GameState.run.log;
    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'No log entries yet.';
      screen.appendChild(empty);
      container.appendChild(screen);
      return;
    }

    // Show entries in reverse chronological order
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      const el = document.createElement('div');
      el.className = 'log-entry';

      const depthLabel = entry.depth !== undefined ? `[S${entry.depth}]` : '';
      const icon = this._typeIcon(entry.type);

      el.innerHTML = `
        <span class="log-depth">${depthLabel}</span>
        ${icon}
        <span class="log-event">${entry.message || ''}</span>
      `;
      screen.appendChild(el);
    }

    container.appendChild(screen);
  },

  _typeIcon(type) {
    const icons = {
      event: '⚡',
      combat: '⚔',
      trade: '💰',
      crew_death: '💀',
      crew_join: '👤',
      system: '⚙',
      nexus: '⬡',
      discovery: '🔍',
    };
    return icons[type] || '·';
  },
};
