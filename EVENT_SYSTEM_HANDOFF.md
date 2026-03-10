# VOID MERIDIAN — Event System Handoff
## For the Coding Agent

---

## Overview

The event content for Void Meridian has been fully designed and authored separately
from the game's code. This document tells you everything you need to implement the
event system correctly so it reads from the authored content without modification.

**Do not redesign the event format.** The format below is the source of truth.
Adapt existing game systems to match it.

The authored content lives in two places:
- `events_master.json` — the single export file containing all events + flag registry
- `events/` — individual JSON files (one per event), same data, useful during development

At runtime the game should load from `events_master.json`.

---

## Current State of the Library

- **29 events** across all 8 node types (3 per type; faction territory has 8 total, 2 per faction)
- **77 persistent run flags** registered in the flag registry
- **154 authored outcome nodes** (success / partial / failure branches)
- **97 player-facing options** across 39 steps

This is a testing batch. More events will be added using the same schema. The game
must load the full library at startup and filter/select events at runtime based on
game state — it must never hardcode event references.

---

## The Complete Event Schema

Every event is a JSON object. Here is the full shape with every field annotated:

```json
{
  "id": "TRADE_001",
  // String. Unique identifier. Format: TYPE_NNN or FACTION_XXX_NNN.
  // Types: TRADE, DEREL, PLANET, COMBAT, NEXUS, SIGNAL, FACTION, DEAD
  // Faction variants: FACTION_CON, FACTION_VRE, FACTION_DRI, FACTION_REM

  "node_type": "trade_post",
  // String. One of:
  //   trade_post | derelict | planet_exploration | combat |
  //   nexus_anomaly | anomalous_signal | faction_territory | dead_zone

  "title": "The Familiar Face",
  // String. Internal authoring title. NEVER shown to the player.

  "depth_zone": "early",
  // String. Controls when this event can appear. One of:
  //   early  = first third of run (sectors 1–5 approx.)
  //   mid    = middle third (sectors 6–10 approx.)
  //   late   = final third (sectors 11+ approx.)
  //   any    = can appear anywhere

  "faction_context": "none",
  // String. If set, this event only appears inside that faction's territory.
  // One of: concord_assembly | vreth_dominion | drifter_compact |
  //         remnant_collective | none
  // "none" means the event is not faction-gated.

  "min_resonance": 0,
  // Integer. Minimum total Resonance (meta-currency) the player must have
  // accumulated across all runs for this event to be eligible to appear.
  // 0 = no gate. Typical values: 0, 5, 10, 15, 20, 25, 30, 40.

  "tags": ["nexus_awareness", "introductory"],
  // Array of strings. Freeform. Used for filtering, analytics, and future
  // authoring tooling. The game does not currently gate on tags.

  "setup_text": "Narrative text shown when the player first arrives at this node...",
  // String. The opening scene-setting paragraph(s). Displayed before any
  // choices are shown. Always present. Can be long.

  "steps": [ /* see Step schema below */ ],
  // Array of Step objects. Always at least 1. Max 4 (planet exploration).
  // Steps execute in order. Each step can be conditional on a prior step's outcome.

  "notes": "Authoring notes...",
  // String. Internal only. NEVER shown to the player. Contains cross-event
  // connection notes, flag usage guidance, and design intent. Ignore at runtime.

  "created_at": "2026-03-09T05:28:25.100393",
  "updated_at": "2026-03-09T05:28:25.100393",
  "version": 1
  // Metadata. Not used at runtime.
}
```

---

## Step Schema

```json
{
  "step_number": 1,
  // Integer. 1-indexed. Steps within an event execute in sequence.

  "condition": null,
  // Null OR object. If null, this step always executes when reached.
  // If an object:
  //   { "prior_step": 1, "outcome": "success" }
  // This step only executes if step N resolved to the given outcome level.
  // Outcome levels: "success" | "partial" | "failure"
  // Use this to branch a 3-step event based on what happened in step 1.

  "setup_text": "Situation narrative shown before choices...",
  // String. Context paragraph shown at the top of this step's screen.
  // Can be empty string if the event flows directly to choices.

  "options": [ /* see Option schema below */ ]
  // Array of Option objects. 1–4 options per step.
  // For nexus_anomaly and dead_zone events, always exactly 1 option
  // (the player witnesses rather than chooses).
}
```

---

## Option Schema

```json
{
  "label": "Ask what happened to that captain.",
  // String. The button text shown to the player.

  "requires_crew_role": null,
  // String or null. If set, this option is only AVAILABLE (not just visible)
  // if the player has at least one crew member with this role.
  // Values: engineer | pilot | medic | soldier | technician | diplomat | scientist
  // null = no crew requirement.

  "requires_module": null,
  // String or null. If set, this option is only available if the ship has
  // this module installed.
  // Example values: scanner_array | cloaking_drive | breach_pod | field_repair_kit
  //   cargo_compressor | nexus_conduit | targeting_computer | missile_rack
  //   emp_array | energy_lance | afterburners | dark_matter_injectors
  //   stealth_drive | deep_range_array | life_sign_detector
  //   regenerative_plating | ablative_layers | kinetic_dampeners
  //   compression_system | hidden_compartments | med_bay
  // null = no module requirement.

  "requires_rep": null,
  // Null OR object. If set, requires minimum faction reputation.
  // Format: { "faction": "concord_assembly", "min_tier": "+1" }
  // Faction keys: concord_assembly | vreth_dominion | drifter_compact | remnant_collective
  // Rep tiers (ascending): "-3" | "-2" | "-1" | "0" | "+1" | "+2" | "+3"
  // null = no rep requirement.

  "requires_flag": null,
  // String or null. If set, this option is only available if the named run flag
  // is currently SET in the player's active run flags.
  // null = no flag requirement.
  // See Flag System section below.

  "requires_ability": null,
  // String or null. If set, this option requires the captain to have this ability.
  // Values: combat | diplomacy | hacking | nexus_attunement
  // null = no ability requirement.

  "locked_hint": "Requires Diplomat crew member",
  // String. Text shown on the button when the option is LOCKED (requirements
  // not met). The button is visible but grayed and non-interactive.
  // Empty string = don't show any hint (option is simply hidden when locked).
  // IMPORTANT: Options with a locked_hint should ALWAYS be shown to the player
  // even when locked. This is a core GDD design principle — players should see
  // that other paths exist. Options without a locked_hint can be hidden entirely.

  "check_type": "skill",
  // String. The resolution mechanic for this option. One of:
  //   "none"  — no dice roll; always resolves to "success" outcome only
  //   "skill" — crew skill check against a difficulty
  //   "stat"  — captain stat check against a difficulty
  // When check_type is "none", only the "success" outcome is used.
  // The "partial" and "failure" outcomes will be null.

  "check_target": "diplomat",
  // String or null. The crew role or captain ability used for the check.
  // For "skill" checks: crew role key (engineer | pilot | medic | etc.)
  // For "stat" checks: captain ability key (combat | diplomacy | hacking | nexus_attunement)
  // null when check_type is "none".

  "difficulty": "medium",
  // String. Difficulty of the check. One of:
  //   easy     — most crew succeed most of the time (~75%+ with relevant role)
  //   medium   — specialist succeeds reliably, generalist ~50/50
  //   hard     — requires skilled specialist + good morale; partial is common
  //   critical — near-impossible without specific unlocks; failure is narrative
  // Ignored when check_type is "none".

  "outcomes": {
    "success": { /* Outcome object — see below */ },
    "partial": { /* Outcome object or null */ },
    "failure": { /* Outcome object or null */ }
  }
  // When check_type is "none", partial and failure will be null.
  // When check_type is "skill" or "stat", all three should be present.
  // Partial is the most common result at medium difficulty.
}
```

---

## Outcome Schema

```json
{
  "level": "success",
  // String. "success" | "partial" | "failure". Matches the key it lives under.

  "narrative": "She takes a long breath. 'Went deep,' she says...",
  // String. The resolution text shown to the player. This is the story beat
  // that plays out after their choice. Always present, never empty.

  "rewards": [
    {
      "type": "fuel",
      "value": 2,
      "description": "Partial fuel discount from a spooked merchant"
    }
  ],
  // Array of Reward objects. Can be empty [].
  // Reward types and value interpretation:
  //   "credits"      — value: integer (positive = gain, negative = cost)
  //   "fuel"         — value: integer (positive = gain, negative = cost)
  //   "hull_repair"  — value: integer (hull % restored, positive only)
  //   "module"       — value: string (module key to add to ship inventory)
  //   "crew_recruit" — value: string (crew ID / slug for the recruited member)
  //   "rep_up"       — value: string (faction key that gains +1 rep)
  //   "rep_down"     — value: string (faction key that loses -1 rep)
  //   "resonance"    — value: integer (meta-currency added to total Resonance)
  //   "run_flag"     — value: string (flag key — alternative to sets_flag field)
  //   "cargo"        — value: string (cargo item key or description slug)
  //   "lore_fragment"— value: string (lore fragment ID — log entry, not mechanical)
  //   "unlock_hint"  — value: string (internal note about what this hints at unlocking)
  // Note: "lore_fragment" rewards are for player log/codex only, no mechanical effect.
  // Note: negative credit/fuel values are costs, not bonuses — apply as drain.

  "sets_flag": "heard_prior_captain_rumor",
  // String or null. If set, this run flag is SET in the player's active flags
  // when this outcome resolves. See Flag System section.
  // A small number of outcomes also have an "additional_flags" array for
  // setting multiple flags simultaneously — see below.

  "additional_flags": ["second_flag_key"],
  // Array of strings or absent. When an outcome needs to set more than one flag,
  // the primary flag is in sets_flag and additional flags are here.
  // Apply all of them when the outcome resolves. This field may not be present
  // on most outcomes — treat its absence as an empty array.

  "clears_flag": null,
  // String or null. If set, this run flag is CLEARED from the player's active
  // flags when this outcome resolves.
  // Used when a flag represents an ongoing state that gets resolved
  // (e.g., clearing a debt flag when the debt is paid).

  "morale_delta": 2,
  // Integer. Change applied to ALL crew's morale immediately on resolution.
  // Range: typically -10 to +10. 0 = no change.
  // Applied as: crew[i].morale = clamp(crew[i].morale + morale_delta, 0, 100)

  "loyalty_delta": 0,
  // Integer. Change applied to the loyalty of CREW ASSIGNED TO THIS ACTION.
  // For events with no crew assignment (most trade/dead zone events), apply to
  // all crew. For boarding/planet events where specific crew were assigned,
  // apply only to those crew.
  // Range: typically -5 to +8.

  "hull_delta": 0,
  // Integer. Immediate hull % change. Negative = damage. Positive = repair.
  // Applied as: ship.hull = clamp(ship.hull + hull_delta, 1, 100)
  // Note: hull can never go to 0 from an event outcome alone — use 1 as floor.
  // Combat resolution handles hull-to-zero separately.

  "resonance_delta": 1
  // Integer. Added to the player's TOTAL RESONANCE (the meta-currency that
  // persists across all runs). Always positive or zero in event outcomes.
  // Applied immediately and permanently on outcome resolution.
}
```

---

## The Flag System

Flags are the connective tissue of the run. They are **string keys** stored in a
per-run set. A flag is either set or it isn't. There are no flag values — only
presence or absence.

### The Flag Registry

The `events_master.json` root contains a `flag_registry` object:

```json
{
  "flag_registry": {
    "heard_prior_captain_rumor": {
      "description": "Merchant at Yura mentioned a prior Nexus-bearing ship",
      "set_by": ["TRADE_001"],
      "read_by": ["DEAD_001", "NEXUS_xxx"]
    },
    ...
  }
}
```

The registry is for **reference only** — it documents which events set and read
each flag. The game does not need to enforce this; it's a design record.
Load it into a dev console if useful, but don't gate on it at runtime.

### How Flags Work at Runtime

```
run_flags = Set<string>   // starts empty every run

// Setting a flag (from outcome.sets_flag):
run_flags.add("heard_prior_captain_rumor")

// Setting additional flags (from outcome.additional_flags):
for flag in outcome.additional_flags:
    run_flags.add(flag)

// Clearing a flag (from outcome.clears_flag):
run_flags.delete("vreth_captain_debt_owed")

// Checking a flag (from option.requires_flag):
option_available = run_flags.has("vreth_captain_debt_owed")

// Checking a flag for event eligibility:
// (Some events depend on prior flags — implement this via tags or requires_flag
//  on the first option, not at the event-selection level for now)
```

### Flag Persistence

Flags are **run-scoped only**. They reset at the start of every new run.
They do NOT persist to the meta-layer (only Resonance does that).

### True Ending Gate Flags

The following flags are required (along with other conditions) for the True Ending.
Track these with particular care — they should never be accidentally cleared:

```
ruins_point_to_wound_discovered
vreth_nexus_eleven_captains
knows_eleven_captains_arrived
read_archivist_full_record
knows_wound_is_door
nexus_remembers_builders_known
transmission_first_captain_received
crew_given_full_choice
```

---

## Event Selection Logic

At runtime, when the player arrives at a node, the game selects an event to present.

### Eligibility Criteria (filter in this order)

1. **node_type** must match the current node type
2. **faction_context** must match the current faction territory (or be `"none"`)
3. **depth_zone** must match the current run depth:
   - `"early"` = sectors 1–(run_length/3)
   - `"mid"` = sectors (run_length/3)–(run_length*2/3)
   - `"late"` = sectors (run_length*2/3)–end
   - `"any"` = always eligible
4. **min_resonance** must be ≤ player's total accumulated Resonance
5. **Not already seen this run** — don't repeat events within the same run
   (track seen event IDs in a per-run set)

### Selection from Eligible Pool

After filtering, pick randomly from the eligible pool.
No weighted selection needed for now — uniform random is fine for testing.

If the eligible pool is empty (all events seen, or none match depth/faction),
fall back to the most recently added events of that node type ignoring depth_zone,
or generate a minimal placeholder event (see Placeholder Events below).

### Placeholder Events

For testing, if no eligible event exists for a node type, use this minimal structure
so the game doesn't break:

```json
{
  "id": "PLACEHOLDER",
  "setup_text": "Nothing of interest here. You move on.",
  "steps": [{
    "step_number": 1,
    "condition": null,
    "setup_text": "",
    "options": [{
      "label": "Continue.",
      "check_type": "none",
      "outcomes": {
        "success": {
          "narrative": "You continue on.",
          "rewards": [],
          "sets_flag": null,
          "clears_flag": null,
          "morale_delta": 0,
          "loyalty_delta": 0,
          "hull_delta": 0,
          "resonance_delta": 0
        },
        "partial": null,
        "failure": null
      }
    }]
  }]
}
```

---

## Option Availability Logic

When presenting options to the player, evaluate each option's requirements:

```
function isOptionAvailable(option, gameState):
    if option.requires_crew_role != null:
        if not gameState.crew.any(c => c.role == option.requires_crew_role):
            return LOCKED

    if option.requires_module != null:
        if not gameState.ship.modules.includes(option.requires_module):
            return LOCKED

    if option.requires_rep != null:
        faction = option.requires_rep.faction
        minTier = option.requires_rep.min_tier  // e.g. "+1"
        if gameState.reputation[faction] < parseTier(minTier):
            return LOCKED

    if option.requires_flag != null:
        if not gameState.run_flags.has(option.requires_flag):
            return LOCKED

    if option.requires_ability != null:
        if not gameState.captain.abilities.includes(option.requires_ability):
            return LOCKED

    return AVAILABLE
```

**Display rule for locked options:**
- If `locked_hint` is non-empty: show the option button, grayed out, with
  `locked_hint` text visible. Player can see it but cannot select it.
- If `locked_hint` is empty string: hide the option entirely.

This is a core design principle from the GDD. Players should always be able to
see that other paths exist, teaching the system without a tutorial.

---

## Check Resolution Logic

When a player selects an option with `check_type != "none"`:

```
function resolveCheck(option, gameState):
    if option.check_type == "none":
        return "success"

    // Get the relevant skill value (0–100)
    skillValue = getSkillValue(option.check_target, gameState)

    // Apply morale modifier
    avgMorale = gameState.crew.averageMorale()
    moraleModifier = (avgMorale - 50) * 0.2  // -10 to +10

    effectiveSkill = clamp(skillValue + moraleModifier, 0, 100)

    // Difficulty thresholds (tune during playtesting)
    thresholds = {
        "easy":     { success: 40, partial: 20 },
        "medium":   { success: 60, partial: 35 },
        "hard":     { success: 75, partial: 50 },
        "critical": { success: 90, partial: 70 }
    }

    roll = random(0, 100)
    t = thresholds[option.difficulty]

    if roll + effectiveSkill >= 100 * (t.success / 100):
        // Adjust this formula during tuning
        return "success"
    else if roll + effectiveSkill >= 100 * (t.partial / 100):
        return "partial"
    else:
        return "failure"
```

Note: The exact formula above is a starting point. Tune the math during playtesting.
What matters is that the three outcome levels are meaningfully distinct and that
`partial` is the most common outcome at `medium` difficulty.

---

## Applying Outcomes

When an outcome resolves, apply in this exact order:

1. **Narrative** — display `outcome.narrative` to the player
2. **Hull delta** — apply `outcome.hull_delta` to ship hull (clamp 1–100)
3. **Morale delta** — apply `outcome.morale_delta` to all crew (clamp 0–100)
4. **Loyalty delta** — apply `outcome.loyalty_delta` to assigned/relevant crew
5. **Resonance delta** — add `outcome.resonance_delta` to total Resonance
6. **Rewards** — process each reward in `outcome.rewards` array (see reward types above)
7. **Sets flag** — if `outcome.sets_flag` is non-null, add to run_flags
8. **Additional flags** — if `outcome.additional_flags` exists, add each to run_flags
9. **Clears flag** — if `outcome.clears_flag` is non-null, remove from run_flags
10. **Advance to next step** — if multi-step event, evaluate next step's condition

---

## Multi-Step Event Flow

```
function runEvent(event, gameState):
    display(event.setup_text)

    for step in event.steps:
        // Check condition
        if step.condition != null:
            priorOutcome = gameState.lastStepOutcome[step.condition.prior_step]
            if priorOutcome != step.condition.outcome:
                continue  // skip this step

        display(step.setup_text)
        option = awaitPlayerChoice(step.options, gameState)
        outcomeLevel = resolveCheck(option, gameState)
        outcome = option.outcomes[outcomeLevel]
        applyOutcome(outcome, gameState)

        // Store for conditional steps
        gameState.lastStepOutcome[step.step_number] = outcomeLevel

    markEventSeen(event.id, gameState)
```

---

## Reward Processing Reference

```
switch reward.type:
    case "credits":
        gameState.credits += reward.value  // negative values are costs

    case "fuel":
        gameState.fuel = clamp(gameState.fuel + reward.value, 0, gameState.fuelMax)

    case "hull_repair":
        gameState.ship.hull = clamp(gameState.ship.hull + reward.value, 0, 100)

    case "module":
        gameState.ship.pendingModules.push(reward.value)
        // Show module-found notification; player installs at next opportunity

    case "crew_recruit":
        gameState.pendingCrew.push(reward.value)
        // Show crew-found notification; player confirms at next opportunity

    case "rep_up":
        gameState.reputation[reward.value] = clamp(
            gameState.reputation[reward.value] + 1, -3, 3
        )

    case "rep_down":
        gameState.reputation[reward.value] = clamp(
            gameState.reputation[reward.value] - 1, -3, 3
        )

    case "resonance":
        gameState.totalResonance += reward.value
        // This is the META currency — persists across runs

    case "run_flag":
        gameState.run_flags.add(reward.value)
        // Same as sets_flag, just expressed as a reward

    case "cargo":
        gameState.ship.cargo.push(reward.value)

    case "lore_fragment":
        gameState.runLog.addLoreEntry(reward.value, reward.description)
        // Display in LOG tab; no mechanical effect

    case "unlock_hint":
        // Internal/dev only. No player-facing effect. Log to console if desired.
```

---

## Loading events_master.json

The game should load `events_master.json` once at startup:

```javascript
// Suggested loader
async function loadEventLibrary() {
    const response = await fetch('./events_master.json');
    const master = await response.json();

    return {
        events: master.events,               // Array — index by id for fast lookup
        flagRegistry: master.flag_registry,  // Object — dev reference only
        eventIndex: Object.fromEntries(
            master.events.map(e => [e.id, e])
        ),
        eventsByType: master.events.reduce((acc, e) => {
            (acc[e.node_type] = acc[e.node_type] || []).push(e);
            return acc;
        }, {})
    };
}
```

No external API calls are needed during gameplay. The file is fully self-contained.
This is an offline-capable game — `events_master.json` is static content.

---

## Event IDs and Naming Conventions

| Prefix | Node Type |
|---|---|
| `TRADE_NNN` | trade_post |
| `DEREL_NNN` | derelict |
| `PLANET_NNN` | planet_exploration |
| `COMBAT_NNN` | combat |
| `NEXUS_NNN` | nexus_anomaly |
| `SIGNAL_NNN` | anomalous_signal |
| `FACTION_CON_NNN` | faction_territory (Concord Assembly) |
| `FACTION_VRE_NNN` | faction_territory (Vreth Dominion) |
| `FACTION_DRI_NNN` | faction_territory (Drifter Compact) |
| `FACTION_REM_NNN` | faction_territory (Remnant Collective) |
| `DEAD_NNN` | dead_zone |

Numbers are zero-padded to 3 digits. Never reuse an ID even if an event is deleted.

---

## Named Characters and Crew Recruits

Several events offer named characters as crew recruits via `crew_recruit` rewards.
The following named characters exist in the current library:

| Recruit ID | Role | Introduced In | Notes |
|---|---|---|---|
| `dr_yema_osha` | Medic | DEREL_001 | Survivor of pathogen incident; haunted trait |
| `dorin_engineer` | Engineer | TRADE_003 | Vreth refugee; skilled specialist |
| `sera_soldier` | Soldier | TRADE_003 | Vreth refugee; quiet/watchful |
| `nils_engineer` | Engineer | PLANET_001 | Tannen colonist; haunted (left colleagues behind) |
| `oss_navigator_pilot` | Pilot | SIGNAL_001 | Drifter Compact; experienced; curious trait |
| `vel_remnant_scientist` | Scientist | SIGNAL_003 | Remnant Collective; ~300 years old; unique knowledge |
| `tannen_engineer` | Engineer | PLANET_001 | Generic Tannen colonist |
| `tannen_medic` | Medic | PLANET_001 | Young; asks too many questions |
| `tannen_botanist` | Scientist (eventually) | PLANET_001 | First time off-world |
| `vreth_saa_daughter` | Soldier (implied) | FACTION_VRE_002 | Not directly recruitable in current events |

Named characters (those with specific IDs like `dr_yema_osha`) should have
distinct portrait treatment in the UI (per GDD Module 10) and unique dialogue
that references their backstory. Generic recruits (`tannen_engineer`, etc.) use
standard role portraits.

---

## Nexus Anomaly and Dead Zone: Special Handling

These two node types have no traditional player choice — the player witnesses
an event and has a single acknowledgment option.

**Nexus Anomaly events:**
- Always award Resonance (the `resonance_delta` on the sole outcome)
- The single option label should be an internal acknowledgment, not a meaningful choice
- Display the step's `setup_text` as the full event — it IS the encounter
- The choice button just advances the player forward

**Dead Zone events:**
- Pure atmosphere and lore
- The `setup_text` of step 1 contains the ghost transmission text (formatted with `[TRANSMISSION...]` markers)
- Treat the transmission text as verbatim display — preserve line breaks
- The single option is the player "noting" what they've heard

**Nexus transmission visual treatment (from GDD Module 10):**
Nexus transmissions (found inside Nexus Anomaly `setup_text` and some Dead Zone
transmissions) should interrupt normal UI with:
- Full-screen dark overlay regardless of system light/dark mode
- Text centered, slightly larger than body text
- Fade in → hold → fade out
- Player cannot dismiss early — it plays on its own timing
- All-caps text (already formatted this way in the authored content)

---

## Faction Reputation Tiers

Reputation is tracked per faction as an integer from -3 to +3:

| Value | Label | Key Effects |
|---|---|---|
| +3 | Honored | Exclusive modules, elite crew, quest finale, significant discounts |
| +2 | Allied | Faction crew available, quest chains, price discounts, free passage |
| +1 | Friendly | Basic quests, minor discounts, no tolls |
| 0 | Neutral | Standard prices, toll at territory entry |
| -1 | Suspicious | Increased tolls, sensor sweeps |
| -2 | Hostile | No trade, intercept patrols, bounty |
| -3 | Nemesis | Shoot on sight, bounty hunters in neutral space |

The `requires_rep` field on options uses the string representation:
`"+1"`, `"+2"`, `"+3"`, `"0"`, `"-1"`, `"-2"`, `"-3"`.

Parse these as integers for comparison: `parseInt(tier)`.

---

## Changes Required to Existing Systems

If the game already has an event or encounter system, make the following changes:

1. **Remove any hardcoded event text or choices.** All event content now lives in
   `events_master.json`. The code should contain zero authored narrative strings.

2. **Replace any existing event format with the schema above.** If there is an
   existing event object structure, map its fields to the schema defined here.
   The mapping priorities are: narrative text → `setup_text` / `outcome.narrative`,
   choices → `options`, consequences → `outcome` fields.

3. **Implement the flag system as a per-run Set.** If there is an existing
   state/consequence tracking system, consolidate it into the run_flags Set.
   The flag registry in `events_master.json` documents all 77 current flags.

4. **Implement the three-outcome resolution model.** If the existing system has
   binary pass/fail, add `partial` as a middle outcome. Partial is the most
   common result at medium difficulty — it should never feel like a lesser failure.
   It should feel like: you did it, but it cost something.

5. **Implement the locked-but-visible option display.** If locked options are
   currently hidden, change them to render grayed with the `locked_hint` text.
   This is non-negotiable per GDD Module 10 — it teaches the system passively.

6. **Connect the `resonance_delta` field to the meta-progression system.**
   Resonance is the only thing that persists across runs (besides unlocks).
   Every `resonance_delta` reward must write to a persistent store, not a
   run-scoped variable.

7. **Implement `additional_flags` processing.** A small number of outcomes
   (4 in the current library) set more than one flag. The primary flag is in
   `sets_flag`; secondary flags are in `additional_flags` (an array). Process both.

8. **Do not modify `events_master.json` at runtime.** Treat it as read-only
   static content. All runtime state lives in the game's state objects.
   New events are added by the authoring tool (`event_author.py`) and
   re-exported to `events_master.json` before the next build/reload.

---

## Files Provided

```
events_master.json          — Full event library (load this at runtime)
flag_registry.json          — Flag cross-reference (dev reference only)
events/                     — Individual event JSON files (same data, per-event)
event_author.py             — Interactive CLI authoring tool
seed_events.py              — Original 3 sample events
generate_batch.py           — Batch generation script for current 29 events
```

Total current library: **29 events, 77 flags, 154 outcome nodes, 97 player options.**

More events will be added using the same schema. The system must handle library
expansion without code changes — purely data-driven loading.

---

## Quick Reference: Field Defaults

When a field is `null` or absent, apply these defaults at runtime:

| Field | Default Behavior |
|---|---|
| `faction_context: "none"` | Event is eligible in any territory |
| `min_resonance: 0` | Always eligible regardless of Resonance |
| `condition: null` | Step always executes |
| `requires_crew_role: null` | Option has no crew requirement |
| `requires_module: null` | Option has no module requirement |
| `requires_rep: null` | Option has no rep requirement |
| `requires_flag: null` | Option has no flag requirement |
| `requires_ability: null` | Option has no ability requirement |
| `locked_hint: ""` | Hide option when locked (don't show grayed) |
| `check_type: "none"` | No roll; always resolves to success |
| `partial: null` | No partial outcome; skip if rolled |
| `failure: null` | No failure outcome; skip if rolled |
| `sets_flag: null` | Don't set any flag |
| `clears_flag: null` | Don't clear any flag |
| `additional_flags: absent` | No additional flags to set |
| `morale_delta: 0` | No morale change |
| `loyalty_delta: 0` | No loyalty change |
| `hull_delta: 0` | No hull change |
| `resonance_delta: 0` | No Resonance gain |
| `rewards: []` | No rewards |
