/* Void Meridian — Star Map Generator */

const MapGenerator = {
  NODE_TYPES: [
    'combat', 'trade', 'derelict', 'planet', 'nexus_anomaly',
    'asteroid', 'distress', 'nebula', 'waystation', 'ambush', 'rest',
  ],

  // Weights for node type distribution by depth zone
  ZONE_WEIGHTS: {
    early: { combat: 2, trade: 3, derelict: 2, planet: 1, distress: 2, rest: 3, waystation: 2, nebula: 1, asteroid: 1, ambush: 0, nexus_anomaly: 0 },
    mid:   { combat: 3, trade: 2, derelict: 3, planet: 2, distress: 2, rest: 2, waystation: 1, nebula: 2, asteroid: 2, ambush: 2, nexus_anomaly: 1 },
    late:  { combat: 4, trade: 1, derelict: 2, planet: 2, distress: 1, rest: 1, waystation: 1, nebula: 2, asteroid: 3, ambush: 3, nexus_anomaly: 2 },
  },

  generate() {
    const totalDepth = 15 + Math.floor(Math.random() * 16); // 15-30
    const nodes = [];
    const edges = [];
    let nodeId = 0;

    // Start node
    nodes.push({
      id: 'node_0',
      depth: 0,
      type: 'waystation',
      revealed: true,
      visited: false,
      x: 0.5,
    });

    // Generate layers
    for (let d = 1; d <= totalDepth; d++) {
      const nodesInLayer = 2 + Math.floor(Math.random() * 3); // 2-4 nodes per layer
      const zone = d <= totalDepth * 0.3 ? 'early' : d <= totalDepth * 0.7 ? 'mid' : 'late';

      for (let i = 0; i < nodesInLayer; i++) {
        nodeId++;
        const type = this._pickNodeType(zone);
        nodes.push({
          id: `node_${nodeId}`,
          depth: d,
          type,
          revealed: false,
          visited: false,
          x: (i + 0.5) / nodesInLayer,
        });
      }
    }

    // Generate edges (connect each node to 1-3 nodes in the next layer)
    for (let d = 0; d < totalDepth; d++) {
      const currentLayer = nodes.filter(n => n.depth === d);
      const nextLayer = nodes.filter(n => n.depth === d + 1);
      if (nextLayer.length === 0) continue;

      for (const node of currentLayer) {
        // Connect to 1-2 nodes in the next layer (prefer nearest by x position)
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
          // Connect from nearest current-layer node
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
