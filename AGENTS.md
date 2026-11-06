# AGENTS

This file defines the configuration, workflows, and skills for Antigravity agents working in this repository.

## Agent skills

### Issue tracker

Issues and PRDs for this repo live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Triage labels

We use the canonical triage label vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain documentation layout. See `docs/agents/domain.md`.

### Design contract

`DESIGN.md` at the repo root is the single source of truth for colour, type, spacing, layout,
copy rules and component anatomy. Read it before changing anything visual. `css/tokens.css` is its
machine-readable form; do not create a second token file.

Before claiming a design change is done, run:

    node scripts/verify-batch.mjs

It checks syntax, undefined `var(--token)` references, that a refactor did not silently restyle
off-grid values, the full test suite, and the per-file invariants. If it prints REVERT, the change
is not ready.
