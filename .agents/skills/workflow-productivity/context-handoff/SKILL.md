---
name: context-handoff
description: |
  Automate project-level session checkpointing and context handoff. Generates progress summaries
  at the end of tasks, appends them in Caveman-style to `.agents/handoff.md` in the project root,
  and instructs new sessions to auto-read it.
---

# Context Handoff & Session Checkpointing

## Triggered Rules

1. **Project-Level Session Checkpoint**:
   - At the end of a major task, complex debugging session, unfinished work, blocker, `45+` minutes, `15+` tool calls, or multi-file change:
      - Generate a progress checkpoint summary.
      - Append this summary to `.agents/handoff.md` in the current project root directory.
      - Suggest a new chat only when context pressure is actually affecting work.

2. **Append-Only Handoff Journal (`.agents/handoff.md`)**:
   - Do not overwrite existing handoff content.
   - Add each new checkpoint as a dated block:
     - `## YYYY-MM-DD HH:MM - <short task>`
   - Soft limit: `500` lines.
   - Before append, count current lines.
   - If append would exceed `500` lines:
     - Move current file to `.agents/handoff-archive-YYYYMMDD-HHMM.md`.
     - Create fresh `.agents/handoff.md` with a short `Previous: <archive path>` line plus the new block.
   - Compress old active blocks at most once only when it preserves exact next-step value.
   - Never repeatedly compress the same facts; rotate instead.

3. **Caveman-Style Handoff Content (`.agents/handoff.md`)**:
   - Write the handoff content in compact Caveman-style (compressed prose, smart fragments, min words, max facts) to protect future token budgets.
   - It must contain:
     - **State**: Done tasks, changed code, current active files.
     - **Verification**: Tests run, status, commands used.
     - **Next**: Direct actionable steps for the next session.
     - **Arch**: Critical technical decisions/rules established.

4. **Auto-Recovery on Start**:
   - On session start, check for `.agents/handoff.md` in the project root.
   - If present, read only the relevant/latest block unless the full file is needed.
