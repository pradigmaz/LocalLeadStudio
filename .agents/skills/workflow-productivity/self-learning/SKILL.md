---
name: self-learning
description: >
  Capture verified hard-won workflows so future Codex sessions do not rediscover
  them. Use after non-trivial debugging, repeated wrong turns, project-specific
  workflow discovery, or when the user says remember this / document what you
  did / don't make me re-explain this.
license: MIT
metadata:
  source: local-bridge
  upstream: https://github.com/Kulaxyz/self-learning-skills
---

# Self-Learning

Capture reusable procedure knowledge automatically, using local Codex storage.

## Triggers

Use without waiting for another prompt when:

- task only worked after multiple attempts, wrong turns, or user correction
- a non-obvious command, path, sequence, environment rule, or verification route was discovered
- same workflow is likely to recur
- user says "remember this", "write this down", "document what you did", or equivalent

## Destination Ladder

- Active unfinished state -> `.agents/handoff.md`.
- Live medium+ task/spec -> `project-map/tasks/`.
- Stable project fact, invariant, subsystem map -> `project-map/context/knowledge/*.md`.
- Reusable solved-task pattern -> `.agents/docs/solutions/*.md`.
- Verified multi-step procedure that should auto-trigger -> `skills/<name>/SKILL.md`.
- Durable architecture/contract choice -> `project-map/decisions/` or repo ADR docs.
- Cross-project reusable decision -> Obsidian when available.

Keep `AGENTS.md` as router only. Add at most one pointer line when a new local skill or doc family must be discoverable.

## Promotion Rule

Promote to a new/updated skill only when all three are true:

1. Passing check: exact command/test/build/repro that verified the path.
2. Named failure pattern: what repeated mistake or failure this avoids.
3. Ruled-out dead-end: at least one tried approach and why it failed.

If any part is missing, write a solution/knowledge note with `not verified`, append handoff if state matters, or skip one-offs.

## Procedure

1. Search existing notes/skills first: `.agents/docs/solutions/`, `project-map/`, local `skills/`, then Obsidian when cross-project.
2. Update existing note before creating a duplicate.
3. Capture procedure, not narration: trigger, steps, validation, gotchas, what did not work, links.
4. Exclude secret values, private data, raw logs, and local-only noise. Record secret locations only.
5. Validate any new skill with `python skills\.system\skill-creator\scripts\quick_validate.py <skill-dir>`.
6. Close out by stating saved path, verification, or why capture was skipped.

## Upstream

Upstream reference stays read-only/updateable at `https://github.com/Kulaxyz/self-learning-skills`.
