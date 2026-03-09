/* Void Meridian — Star Map Generator */

const MapGenerator = {
  // Node types matching events_master.json schema
  NODE_TYPES: [
    'combat', 'trade_post', 'derelict', 'planet_exploration',
    'nexus_anomaly', 'anomalous_signal', 'faction_territory', 'dead_zone',
  ],

  // Weights for node type distribution by depth zone
  ZONE_WEIGHTS: {
    early: {
      combat: 2, trade_post: 3, derelict: 2, planet_exploration: 1,
      anomalous_signal: 2, dead_zone: 1, faction_territory: 2,
      nexus_anomaly: 0,
    },
    mid: {
      combat: 3, trade_post: 2, derelict: 3, planet_exploration: 2,
      anomalous_signal: 2, dead_zone: 2, faction_territory: 2,
      nexus_anomaly: 1,
    },
    late: {
      combat: 4, trade_post: 1, derelict: 2, planet_exploration: 2,
      anomalous_signal: 2, dead_zone: 3, faction_territory: 1,
      nexus_anomaly: 2,
    },
  },

  // Faction assignment for faction_territory nodes
  FACTIONS: ['concord_assembly', 'vreth_dominion', 'drifter_compact', 'remnant_collective'],

  generate() {
    const totalDepth = 15 + Math.floor(Math.random() * 16); // 15-30
    const nodes = [];
    const edges = [];
    let nodeId = 0;

    // Start node
    nodes.push({
      id: 'node_0',
      depth: 0,
      type: 'trade_post',
      revealed: true,
      visited: false,
      x: 0.5,
      faction: null,
    });

    // Generate layers
    for (let d = 1; d <= totalDepth; d++) {
      const nodesInLayer = 2 + Math.floor(Math.random() * 3); // 2-4 nodes per layer
      const zone = d <= totalDepth * 0.3 ? 'early' : d <= totalDepth * 0.7 ? 'mid' : 'late';

      for (let i = 0; i < nodesInLayer; i++) {
        nodeId++;
        const type = this._pickNodeType(zone);
        const faction = type === 'faction_territory'
          ? this.FACTIONS[Math.floor(Math.random() * this.FACTIONS.length)]
          : null;

        nodes.push({
          id: `node_${nodeId}`,
          depth: d,
          type,
          revealed: false,
          visited: false,
          x: (i + 0.5) / nodesInLayer,
          faction,
        });
      }
    }

    // Generate edges (connect each node to 1-3 nodes in the next layer)
    for (let d = 0; d < totalDepth; d++) {
      const currentLayer = nodes.filter(n => n.depth === d);
      const nextLayer = nodes.filter(n => n.depth === d + 1);
      if (nextLayer.length === 0) continue;

      for (const node of currentLayer) {
        const sorted = [...nextLayer].sort((a, b) =>
          Math.abs(a.x - node.x) - Math.abs(b.x - node.x)
        );

        const connectCount = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < Math.min(connectCount, sorted.length); i++) {
          edges.push({ from: node.id, to: sorted[i].id });
        }
      }

      // Ensure every next-layer node has at least one incoming edge
      for (const next of nextLayer) {
        const hasIncoming = edges.some(e => e.to === next.id);
        if (!hasIncoming) {
          const nearest = currentLayer.reduce((best, n) =>
            Math.abs(n.x - next.x) < Math.abs(best.x - next.x) ? n : best
          , currentLayer[0]);
          edges.push({ from: nearest.id, to: next.id });
        }
      }
    }

    return {
      nodes,
      edges,
      maxDepth: totalDepth,
      startNodeId: 'node_0',
    };
  },

  _pickNodeType(zone) {
    const weights = this.ZONE_WEIGHTS[zone] || this.ZONE_WEIGHTS.mid;
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = Math.random() * totalWeight;

    for (const [type, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return type;
    }
    return 'combat';
  },
};
