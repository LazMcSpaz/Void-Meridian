# Void Meridian: Systematic Content Expansion Plan

## The Problem

29 events across 8 node types. A single run visits ~20 nodes. With "seen event" tracking,
players exhaust unique content in 1-2 runs. The game needs **80-100+ events** to feel replayable.

## Current Coverage Gaps

| Node Type | Current Events | Depth Coverage | Target |
|---|---|---|---|
| combat | 3 | early, mid | 10-12 |
| trade_post | 3 | early, mid | 10-12 |
| derelict | 3 | early, early, mid | 8-10 |
| planet_exploration | 3 | early, mid, mid | 8-10 |
| anomalous_signal | 3 | early, mid, late | 8-10 |
| faction_territory | 8 (2/faction) | mixed | 16-20 (4-5/faction) |
| nexus_anomaly | 3 | mid, mid, late | 6-8 |
| dead_zone | 3 | late, late, late | 6-8 |

**Total target: ~80-90 events** (add ~55 new events)

## Approach: Foundation First, Then Events

Events reference weapons, modules, cargo items, crew, and factions. Writing events that
reward "a tier 2 shield generator" when that item doesn't exist creates broken promises.
Build the vocabulary first, then write events that use it.

### Phase 1: Expand the Item/Equipment Vocabulary

**Weapons** (currently 7, target 15-18):
Add tier progression and faction-flavored weapons:
- Tier 1: 2-3 more basic options (beam cutter, flak array, plasma torch)
- Tier 2: 3-4 mid-game upgrades (heavy lance, concussion battery, phase disruptor)
- Tier 3: 2-3 late-game/faction weapons (Vreth honor blade array, Concord suppression lance, Remnant resonance projector)
- Each weapon should have a clear identity: range vs damage vs utility

**Modules** (currently 7, target 15-18):
- Tier 1: 3-4 more (cargo expander, crew morale stabilizer, navigation assist, comms array)
- Tier 2: 3-4 mid-game (advanced med bay, signal jammer, trade cipher, shield harmonics)
- Tier 3: 2-3 late-game (Remnant memory core, Vreth honor beacon, Drifter ghost drive)
- Each module should enable at least one new event option or interaction

**Cargo items** (currently ~6 flag-tracked items):
- Add 8-10 tradeable/usable cargo types (medical supplies, refined fuel cells, encrypted data cores, salvaged components, cultural artifacts, contraband, rare minerals, ration packs)
- These become event rewards AND event requirements, creating natural gameplay loops

### Phase 2: Named Crew Definitions

Populate crew.json with the named characters already referenced:
- **Dr. Yema Osha** (scientist, idealistic) - already has recruitment event
- **Oss** (pilot, reckless) - already has recruitment event
- **Vel** (scientist, curious) - already has recruitment event
- **Dorin** (engineer, pragmatic) - already has recruitment event
- **Sera** (soldier, stoic) - already has recruitment event
- Add 4-6 NEW recruitable named crew across roles not yet covered:
  - A named diplomat (Concord defector?)
  - A named medic (Drifter field surgeon?)
  - A named technician (Remnant-touched hacker?)
  - Each with unique_passive, personalityDescription, and a recruitment event

### Phase 3: Event Generation — Standalone Events First

**Design principle: 60% standalone, 40% flag-reactive.**

Standalone events need no prior flags. They're the bread and butter —
self-contained stories that make each node interesting on its own.

#### Standalone Event Templates by Node Type:

**Combat (add 7-9):**
- Depth-varied encounters: pirate ambush (early), faction patrol (mid), Nexus-corrupted vessel (late)
- 2-3 "choice before combat" events (negotiate, bluff, or fight)
- 1-2 "aftermath" events (stumble onto a battle's remains)
- Each should offer non-combat resolution paths (flee, negotiate, bribe)

**Trade Post (add 7-9):**
- Merchant encounters with different goods/prices
- Station politics (labor dispute, smuggler's offer, faction agent)
- Information brokers (buy rumors, sell data, trade secrets)
- Crew shore leave events (morale recovery, complications, recruitment opportunities)

**Derelict (add 5-7):**
- Varied derelict types: military, civilian, ancient, recent
- Salvage risk/reward decisions
- Environmental hazards (radiation, structural collapse, automated defenses)
- Each should have at least one "what killed the crew?" mystery element

**Planet Exploration (add 5-7):**
- Colony types: thriving, struggling, abandoned, hostile
- Natural phenomena (storms, geological events, alien ecosystems)
- Archaeological discoveries
- Survivor/refugee encounters

**Anomalous Signal (add 5-7):**
- Distress calls (real vs. fake vs. old)
- Strange transmissions (alien, automated, Nexus-related)
- Navigation hazards disguised as signals
- First contact scenarios

**Faction Territory (add 8-12, 2-3 per faction):**
- Concord: bureaucratic encounters, inspection variants, political intrigue
- Vreth: honor challenges, military encounters, cultural exchanges
- Drifter: trade opportunities, information networks, freedom politics
- Remnant: ancient mysteries, knowledge exchanges, Nexus connections

**Nexus Anomaly (add 3-5):**
- Resonance-gated visions
- Ship transformation events
- Nexus entity encounters
- Time/space distortion events

**Dead Zone (add 3-5):**
- Hazard navigation (debris fields, radiation storms)
- Ghost ship encounters
- Prior captain echoes (expand the 11 captains lore)
- Resource scarcity decisions

### Phase 4: Flag-Reactive Event Variants

After standalone events exist, add branching variants that react to prior decisions.
These use `requires_flag` on the event or on specific options.

**Priority flag chains to build out:**
1. **Vreth debt storyline** — COMBAT_001 → COMBAT_003 → resolution events
2. **Osha's pathogen** — DEREL_001 → faction reactions → Nexus implications
3. **The Reclamation Division** — DEREL_002 → FACTION_CON_002 → pursuit/alliance
4. **Passage seekers** — TRADE_003 → Vreth patrol encounters → Maren's talent
5. **The Wound / True Ending** — Knowledge gates accumulating across run

**How to add flag variants WITHOUT requiring flags:**
- Add flag-gated OPTIONS to standalone events (not whole events)
- Example: A trade post event has 3 base options. If `osha_recruited`, add a 4th option where Osha recognizes the merchant
- This keeps events accessible while rewarding continuity

### Phase 5: Depth Zone Balancing

Each depth zone should have enough events that players rarely see repeats:

| Zone | Nodes in Zone | Target Events |
|---|---|---|
| Early (first third) | ~7 nodes | 25-30 events |
| Mid (second third) | ~7 nodes | 25-30 events |
| Late (final third) | ~7 nodes | 20-25 events |

Some events can be `depth_zone: "any"` to fill gaps.

## Implementation Order

1. **weapons.json + modules.json** — Expand to 15-18 each with proper tier/faction spread
2. **Cargo item definitions** — Define tradeable goods the economy can reference
3. **crew.json** — Named crew definitions for existing + new recruitable characters
4. **Standalone events batch 1** — 15-20 events across underserved node types (combat, trade_post, derelict focus)
5. **Standalone events batch 2** — 15-20 more events (planet, signal, faction focus)
6. **Flag-reactive options** — Add conditional options to new standalone events
7. **Flag-reactive events batch** — 10-15 events that require specific prior flags
8. **Nexus/Dead Zone expansion** — 8-10 late-game atmospheric events
9. **Balancing pass** — Ensure depth zone coverage, option count minimums, reward balance

## Quality Rules for All New Events

1. **Minimum 2 unconditional options** per step (established rule)
2. **Maximum 4 options** per step (avoid decision paralysis)
3. **Every event needs narrative texture** — not just mechanical choices
4. **Conditional options are bonuses** — never the only interesting choice
5. **Rewards should match risk** — dangerous choices pay more, safe choices pay less
6. **Morale/loyalty impacts should reflect crew perspective** — not just player benefit
7. **Every event should teach something about the world** — even small standalone encounters
8. **No event should feel like filler** — if the narrative isn't interesting, cut it
9. **Skill checks should have meaningful partial/failure outcomes** — not just "nothing happens"
10. **Flag names should be self-documenting** — `vreth_patrol_warned_brennar` not `flag_47`
