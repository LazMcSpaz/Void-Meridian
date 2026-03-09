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

    // Ship sensor state (computed once, used per node)
    const sensors = GameState.run.ship.baseSystems.sensors;
    const sensorsWorking = sensors && !sensors.damaged;
    const hasScanner = GameState.run.ship.equippedModules.some(m => m.id === 'mod_scanner_array');
    const hasNexusCortex = GameState.run.ship.equippedModules.some(m => m.id === 'mod_nexus_cortex');

    for (let d = Math.max(0, currentDepth - 1); d <= Math.min(map.maxDepth, maxVisible); d++) {
      const layerNodes = map.nodes.filter(n => n.depth === d);
      if (layerNodes.length === 0) continue;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex; gap:var(--space-sm); justify-content:center;';

      for (const node of layerNodes) {
        const el = document.createElement('div');
        // Nexus Cortex reveals nexus_anomaly nodes within visible range
        const nexusCortexReveal = hasNexusCortex && node.type === 'nexus_anomaly' &&
          node.depth <= currentDepth + 3;
        const isRevealed = node.revealed || node.depth <= currentDepth + 1 || nexusCortexReveal;
        const isCurrent = node.id === GameState.run.currentNodeId;
        const isVisited = node.visited;
        const isSelectable = isRevealed && !isVisited && node.depth === currentDepth + 1 &&
                             map.edges.some(e => e.from === GameState.run.currentNodeId && e.to === node.id);

        // Sensor check: need sensors level 3+ or Scanner Array module to identify node types
        const canIdentify = isVisited || nexusCortexReveal ||
          (isRevealed && sensorsWorking && (sensors.level >= 3 || hasScanner));

        el.className = 'map-node' +
          (isCurrent ? ' current' : '') +
          (isVisited ? ' visited' : '') +
          (!isRevealed ? ' hidden-node' : '') +
          (isSelectable ? ' selectable' : '');

        el.textContent = canIdentify ? this._nodeEmoji(node.type) : (isRevealed ? '◌' : '?');
        el.title = canIdentify ? node.type.replace(/_/g, ' ') : 'Unknown';

        // Show faction influence (territory or nearby faction)
        const factionId = node.faction || (isRevealed ? node.nearbyFaction : null);
        if (factionId && isRevealed) {
          const factionColor = this._factionColor(factionId);
          if (node.faction) {
            // Direct faction territory — solid colored border
            el.style.borderColor = factionColor;
            el.style.boxShadow = `0 0 4px ${factionColor}`;
          } else if (node.nearbyFaction) {
            // Approaching faction space — subtle hint
            el.style.borderColor = factionColor;
            el.style.opacity = el.style.opacity || '1';
          }
          // Add faction name to tooltip if sensors can identify
          if (canIdentify) {
            el.title += ` (${this._factionName(factionId)})`;
          }
        }

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
      trade_post: '🏪',
      derelict: '🚧',
      planet_exploration: '🌍',
      nexus_anomaly: '⬡',
      anomalous_signal: '📡',
      faction_territory: '🏛',
      dead_zone: '💀',
    };
    return icons[type] || '·';
  },

  _factionColor(factionId) {
    const colors = {
      concord_assembly: 'var(--faction-concord)',
      vreth_dominion: 'var(--faction-vreth)',
      drifter_compact: 'var(--faction-drifter)',
      remnant_collective: 'var(--faction-remnant)',
    };
    return colors[factionId] || 'var(--text-muted)';
  },

  _factionName(factionId) {
    const names = {
      concord_assembly: 'Concord Assembly',
      vreth_dominion: 'Vreth Dominion',
      drifter_compact: 'Drifter Compact',
      remnant_collective: 'Remnant Collective',
    };
    return names[factionId] || factionId;
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
