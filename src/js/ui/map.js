/* Void Meridian — Map Tab Renderer */

const MapUI = {
  render(container) {
    const screen = document.createElement('div');
    screen.className = 'screen';

    const map = GameState.run.map;
    if (!map) {
      screen.innerHTML = '<div class="section-header">Star Map</div><p style="color:var(--text-muted)">No map generated.</p>';
      container.appendChild(screen);
      return;
    }

    // Header with depth and fuel
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = `◈ SECTOR ${GameState.run.depth} / ??`;
    screen.appendChild(header);

    // Fuel display
    const fuel = document.createElement('div');
    fuel.className = 'system-label';
    fuel.style.marginBottom = 'var(--space-md)';
    fuel.textContent = `FUEL: ${GameState.run.fuel}`;
    screen.appendChild(fuel);

    // Render map layers
    const mapContainer = document.createElement('div');
    mapContainer.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:var(--space-md);';

    const currentDepth = GameState.run.depth;
    const maxVisible = currentDepth + 3;

    for (let d = Math.max(0, currentDepth - 1); d <= Math.min(map.maxDepth, maxVisible); d++) {
      const layerNodes = map.nodes.filter(n => n.depth === d);
      if (layerNodes.length === 0) continue;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:var(--space-sm); justify-content:center;';

      for (const node of layerNodes) {
        const el = document.createElement('div');
        const isRevealed = node.revealed || node.depth <= currentDepth + 1;
        const isCurrent = node.id === GameState.run.currentNodeId;
        const isVisited = node.visited;
        const isSelectable = isRevealed && !isVisited && node.depth === currentDepth + 1 &&
                             map.edges.some(e => e.from === GameState.run.currentNodeId && e.to === node.id);

        el.className = 'map-node' +
          (isCurrent ? ' current' : '') +
          (isVisited ? ' visited' : '') +
          (!isRevealed ? ' hidden-node' : '') +
          (isSelectable ? ' selectable' : '');

        el.textContent = isRevealed ? this._nodeEmoji(node.type) : '?';
        el.title = isRevealed ? node.type : 'Unknown';

        if (isSelectable) {
          el.addEventListener('click', () => this._selectNode(node));
        }

        row.appendChild(el);
      }

      screen.appendChild(row);
    }

    screen.appendChild(mapContainer);
    container.appendChild(screen);
  },

  _nodeEmoji(type) {
    const icons = {
      combat: '⚔',
      trade: '🏪',
      derelict: '🚧',
      planet: '🌍',
      nexus_anomaly: '⬡',
      asteroid: '☄',
      distress: '🆘',
      nebula: '🌫',
      waystation: '⛽',
      ambush: '💀',
      rest: '🏕',
    };
    return icons[type] || '·';
  },

  _selectNode(node) {
    if (GameState.run.fuel <= 0) {
      GameState.addLog('system', 'No fuel remaining.');
      Game.render();
      return;
    }

    GameState.run.fuel--;
    GameState.run.depth = node.depth;
    GameState.run.currentNodeId = node.id;
    node.visited = true;
    node.revealed = true;

    // Reveal adjacent nodes
    const map = GameState.run.map;
    for (const edge of map.edges) {
      if (edge.from === node.id) {
        const target = map.nodes.find(n => n.id === edge.to);
        if (target) target.revealed = true;
      }
    }

    // Trigger node encounter
    EventEngine.triggerNodeEvent(node);
  },
};
