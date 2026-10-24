# Reuse catalog — UMBRAL

This folder is a read-only reference shelf: 30 game source modules plus 16 development/QA scripts. None is imported by UMBRAL, and no dependency or game source under UMBRAL `src/` was changed. Copies preserve original relative paths and are not drop-in packages. Read only the category that helps the current slice. Opus can ignore any or all of them and author replacements.

## What UMBRAL already has

The starter already uses Three.js and Rapier and contains its own `src/game/Director.mjs` memory/rule prototype, scene construction, interaction, audio, collision code, and three maps. Treat that as the baseline. First identify a missing problem before borrowing another system.

## ORBITAL references

### NPC and physical movement (`optional-reuse/orbital/`)

- `src/core/crew/CrewWorld.ts` — fixed-step actor state, needs and activity transitions, checkpoint guards.
- `src/core/crew/CrewNavigation.ts` — walkable cells, clearance and route planning.
- `src/app/CrewRapierMotor.ts` — actual collision-authorized character movement.
- `src/app/CrewPresence.ts` — visual articulation follows measured physical pose.

Transfer the separation of logical state, collision and presentation if useful. The crew needs, work stations, save/economy contract and ship-local coordinates are game-specific; the astronaut appearance is not UMBRAL art.

### Interior/environment authoring (`optional-reuse/orbital/`)

- `src/app/KestrelInterior.ts`, `KestrelInteriorLayout.ts` — modular ship interior and layout.
- `src/app/KestrelD2DoorClearance.ts`, `KestrelD2PressureExtension.ts` — door envelope and pressure-related constraints.
- `src/app/KestrelAisleLighting.ts` — local interior lighting.
- `src/app/mora01/Mora01Interior.ts`, `Mora01PhysicalPresence.ts`, `MoraPassageClearance.ts` — authored interior geometry, physical presence and passage checks.

These show explicit geometry/clearance/lighting relationships, but spaceship geometry, coordinates, pressure rules and materials are not reusable as UMBRAL content. Use them as implementation examples, not visual direction.

## RPG-Sandbox-3D references

### NPC reasoning (`optional-reuse/rpg/src/ai/`)

- `Perception.ts` — sight cone, darkness/sneaking modifiers, occlusion, hearing and remembered sightings.
- `Mind.ts` — character memory, opinions, fear, hostile state and utility-driven goals from observed events.
- `Society.ts` — event witnessing, rumors passed between inhabitants and world-level coordination.
- `NavGrid.ts` — collision-aware A* over walkable terrain.
- `roster.ts` — data-driven character traits and initial setups.

This is the most relevant reference for NPC senses and memory. It belongs to a medieval combat/society simulation and contains assumptions UMBRAL should not inherit: character classes, crimes, magic, loot, food/jobs and settlement economy. Copy the narrow pattern that solves the slice; do not port the full RPG brain.

### Environment simulation (`optional-reuse/rpg/src/world/`)

`Environment.ts`, `World.ts`, `terrain.ts`, `water.ts`, `fire.ts`, `groundMaterial.ts`, `layout.ts`, and `village.ts` show world composition, time/environment systems, terrain, fire/water, materials and authored location data. They are outdoor sandbox systems, not indoor horror rooms. Their useful pattern is that environment effects have state and world consequences; their landscapes and gameplay are unrelated.

### Character and motion (`optional-reuse/rpg/src/animation/` and `src/characters/`)

`Animator.ts`, `pose.ts`, `ik.ts`, `Character.ts`, and `Body.ts` are the actual RPG humanoid body, pose/IK, locomotion/action animation, and character behaviors. They are substantially coupled to the RPG skeleton, combat verbs, items, injury systems and rendering. Inspect for a specific movement or physical-presence problem; avoid copying the whole character framework or its art style.

## Development and QA scripts (`optional-reuse/*/tools/`)

- Orbital: `tools/qa/orbital-slice-qa.mjs`, `run-vertical-qa.mjs`, `verify-snapshot.mjs`, `run-release-qa.mjs`, plus `tools/visual-feed.mjs` and `tools/art/visual-evidence.mjs` show scenario QA, capture and evidence workflows.
- RPG: `tools/scenarios-env.mjs`, `scenarios-body.mjs`, `scenarios-physics.mjs`, `shoot.mjs`, `capture.mjs`, `smoke.mjs`, GLTF inspection/validation/optimization and `blender/build_inhabitant.py` show environment/actor scenarios, automated capture, smoke checks and asset validation/build steps.

These scripts reference their original project's runtime and paths. They are examples to adapt, not commands to run from this ZIP.

## Shared-module audit

The two projects share the Three.js and Rapier ecosystem, but this inspection found no common source package, shared source directory, or identical reusable implementation. The matching filenames are generic entry/type files, not a shared module. Their package versions are close enough to make small concepts comparable, but dependencies alone do not make the game systems compatible. Do not invent a shared package during the UMBRAL slice; extract one only if the same stable feature is genuinely needed in both games.

## How to use this shelf

1. Understand the relevant UMBRAL system first.
2. Open one reference category only when it addresses a concrete gap.
3. Decide whether to adapt a small idea, write a native UMBRAL version, or do nothing.
4. Keep all unused references inert; never add all of `optional-reuse/` to the build.

The copied TypeScript files and scripts come from separate repositories and retain imports/commands that resolve only inside their source projects. They are for inspection, not compilation or execution here. The source projects have no root license file visible in this audit; this package makes no license claim. Review applicable rights before redistribution beyond this handoff.
