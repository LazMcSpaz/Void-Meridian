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
    fuel.style.marginBottom = 'var(--space-sm)';
    fuel.textContent = `FUEL: ${GameState.run.fuel}`;
    screen.appendChild(fuel);

    // Faction color legend
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex; gap:var(--space-md); flex-wrap:wrap; font-size:var(--font-size-sm); margin-bottom:var(--space-md);';
    const factions = [
      { name: 'Concord', color: 'var(--faction-concord)' },
      { name: 'Vreth', color: 'var(--faction-vreth)' },
      { name: 'Drifter', color: 'var(--faction-drifter)' },
      { name: 'Remnant', color: 'var(--faction-remnant)' },
    ];
    for (const f of factions) {
      const item = document.createElement('span');
      item.style.cssText = `color:${f.color};`;
      item.textContent = `● ${f.name}`;
      legend.appendChild(item);
    }
    screen.appendChild(legend);

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
    // Crew synergy: Scanner Array + scientist reveals one extra layer
    const scannerSynergy = hasScanner && GameState.run.crew.some(c => !c.dead && c.role === 'scientist');
    // Sera passive: detects ambush (combat) events one step earlier
    const seraDetectsAmbush = CrewEngine.hasNamedCrew('sera');

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
        const revealRange = scannerSynergy ? currentDepth + 2 : currentDepth + 1;
        const isRevealed = node.revealed || node.depth <= revealRange || nexusCortexReveal;
        const isCurrent = node.id === GameState.run.currentNodeId;
        const isVisited = node.visited;
        const isSelectable = isRevealed && !isVisited && node.depth === currentDepth + 1 &&
                             map.edges.some(e => e.from === GameState.run.currentNodeId && e.to === node.id);

        // Some nodes broadcast their presence (no sensors needed)
        const broadcasts = node.type === 'trade_post' || node.type === 'dead_zone' ||
          node.type === 'faction_territory';
        // Sera passive: can identify combat nodes one layer further out
        const seraReveal = seraDetectsAmbush && node.type === 'combat' && node.depth <= currentDepth + 2;
        // Sensor check: need sensors level 3+ or Scanner Array module to identify other nodes
        const canIdentify = isVisited || (isRevealed && broadcasts) || nexusCortexReveal || seraReveal ||
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

    // Safety: show message if no selectable nodes exist (should not happen mid-map)
    const anySelectable = map.nodes.some(n => {
      if (n.visited || n.depth !== currentDepth + 1) return false;
      return map.edges.some(e => e.from === GameState.run.currentNodeId && e.to === n.id);
    });
    if (!anySelectable && currentDepth < map.maxDepth) {
      const warn = document.createElement('div');
      warn.style.cssText = 'color:var(--color-warning); text-align:center; margin-top:var(--space-md); font-size:var(--font-size-sm);';
      warn.textContent = 'No navigable nodes detected. The void presses in...';
      screen.appendChild(warn);

      // Auto-generate forward connection as emergency fallback
      const nextLayer = map.nodes.filter(n => n.depth === currentDepth + 1 && !n.visited);
      if (nextLayer.length > 0) {
        const fallback = nextLayer[Math.floor(Math.random() * nextLayer.length)];
        map.edges.push({ from: GameState.run.currentNodeId, to: fallback.id });
        fallback.revealed = true;
        GameState.addLog('system', 'Emergency nav-lock: new route detected.');
        Game.render();
        return;
      }
    }

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

    // Fuel Recycler: 15% chance to not consume fuel on jump
    // Oss passive: additional 10% chance to avoid fuel cost
    const hasFuelRecycler = GameState.run.ship.equippedModules.some(m => m.id === 'mod_fuel_recycler');
    const hasOss = CrewEngine.hasNamedCrew('oss');
    let fuelSaved = false;
    if (hasFuelRecycler && Math.random() < 0.15) {
      GameState.addLog('system', 'Fuel Recycler reclaimed exhaust — no fuel consumed.');
      fuelSaved = true;
    } else if (hasOss && Math.random() < 0.10) {
      GameState.addLog('system', 'Oss found a shortcut — no fuel consumed.');
      fuelSaved = true;
    }
    if (!fuelSaved) {
      GameState.run.fuel--;
    }
    GameState.run.depth = node.depth;
    GameState.run.currentNodeId = node.id;
    node.visited = true;
    node.revealed = true;

    // Rally Cry: +10 crew morale every 5 nodes traversed
    if (GameState.run.captain.abilities.includes('rally_cry')) {
      GameState.run._rallyCryCounter = (GameState.run._rallyCryCounter || 0) + 1;
      if (GameState.run._rallyCryCounter >= 5) {
        GameState.run._rallyCryCounter = 0;
        CrewEngine.adjustMoraleAll(10);
        GameState.addLog('system', 'Rally Cry! The captain\'s words lift the crew\'s spirits. (+10 morale)');
      }
    }

    // Vel passive: +1 Resonance at nexus_anomaly nodes
    if (node.type === 'nexus_anomaly' && CrewEngine.hasNamedCrew('vel')) {
      GameState.meta.resonance += 1;
      GameState.addLog('nexus', 'Vel communes with the Nexus. (+1 Resonance)');
    }

    // Reveal adjacent nodes
    const map = GameState.run.map;
    for (const edge of map.edges) {
      if (edge.from === node.id) {
        const target = map.nodes.find(n => n.id === edge.to);
        if (target) target.revealed = true;
      }
    }

    // Check if this is the final depth — trigger voyage ending
    const hasForwardEdges = map.edges.some(e => e.from === node.id);
    if (!hasForwardEdges || node.depth >= map.maxDepth) {
      this._triggerVoyageEnd(node);
      return;
    }

    // Trade posts use the depot docking system
    if (node.type === 'trade_post') {
      DepotUI.enterDepot(node);
      return;
    }

    // Trigger node encounter
    EventEngine.triggerNodeEvent(node);
  },

  _triggerVoyageEnd(node) {
    // Check for True Ending conditions
    const hasTrueEndingFlags = NexusEngine.checkTrueEnding();
    const resonanceTier = GameState.getResonanceTier();

    // Mark milestone flags
    NexusEngine.checkMilestone('wound_reached');

    if (hasTrueEndingFlags) {
      // True ending path — player has all required flags
      NexusEngine.checkMilestone('wound_entered');
      NexusEngine.checkMilestone('nexus_confronted');
      GameState.meta.trueEndingReached = true;
      NexusEngine.accumulateRunResonance();
      GameState.endRun('true_ending');
      GameState.screen = 'ending';
      GameState.save();
      Game.render();
    } else if (resonanceTier >= 3) {
      // High resonance — the Wound pulls them through but the journey continues
      const gained = NexusEngine.accumulateRunResonance();
      GameState.addLog('nexus', `The Wound shimmers at the edge of space. Resonance surges. (+${gained})`);

      // Generate a new map sector to continue the voyage
      const newMap = MapGenerator.generate();
      GameState.run.map = newMap;
      GameState.run.currentNodeId = newMap.startNodeId;
      GameState.run.depth = 0;
      const startNode = newMap.nodes.find(n => n.id === newMap.startNodeId);
      if (startNode) {
        startNode.visited = true;
        startNode.revealed = true;
        for (const edge of newMap.edges) {
          if (edge.from === startNode.id) {
            const target = newMap.nodes.find(n => n.id === edge.to);
            if (target) target.revealed = true;
          }
        }
      }

      GameState.addLog('system', 'The Wound bends space. A new sector unfolds before you.');
      GameState.save();
      Tabs.switchTo('map');
    } else {
      // Standard ending — not enough resonance
      const gained = NexusEngine.accumulateRunResonance();
      GameState.addLog('nexus', `The void stretches endlessly. Your instruments fail. Resonance gained: ${gained}.`);
      GameState.endRun('void_consumed');
      GameState.screen = 'gameOver';
      GameState.save();
      Game.render();
    }
  },
};
