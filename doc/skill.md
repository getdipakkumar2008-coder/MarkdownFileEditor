---
name: md-editor-build
description: Guides implementation of the Markdown & Text File Editor per specification.md and Architecture.md — use when building, extending, or reviewing this project's features (file system adapters, autosave, Markdown rendering/sanitization, editor integration). Enforces the project's hard rules and phased build order.
---

# Markdown & Text File Editor — Build Skill

This skill packages the build order and guardrails for implementing this repository's product, defined in `specification.md` (requirements) and `Architecture.md` (design). Load those two files fully before using this skill on a non-trivial task — this skill is a workflow wrapper around them, not a replacement.

## When to use this

- Implementing any feature listed in `specification.md` §3 (FR-1 through FR-24).
- Adding/modifying a `FileSystemAdapter`, `MarkdownRenderer`, `AutosaveService`, or `BackupStore` implementation.
- Reviewing a PR/diff against this project's acceptance criteria.

Do not use this skill for unrelated tooling/infra tasks in this repo (e.g., CI config, README edits) — just do those directly.

## Recommended build order (phased, not all-at-once)

Build in this order — each phase is independently testable and later phases depend on earlier interfaces being stable:

1. **Core interfaces & DI scaffolding** (Architecture.md §2.1, §10): `FileSystemAdapter`, `MarkdownRenderer`, `ErrorReporter`, `BackupStore` interfaces, no implementations yet.
2. **NativeFileSystemAdapter + capability detector**: open folder, list tree, read/write file. Get FR-1, FR-5, FR-7 working end-to-end on Chromium before touching the editor.
3. **File tree UI**: virtualized, ARIA treeview, context menu (FR-1–4). Wire to the adapter from step 2.
4. **CodeMirror integration** (FR-8–10): editor pane bound to open-file state, no autosave yet.
5. **MarkdownRenderer + DOMPurify pipeline** (FR-16–20): single `renderSafe()` path, preview pane, scroll-sync. Write the XSS payload corpus test **before or alongside** this, not after.
6. **AutosaveService + BackupStore** (FR-11–15): debounced disk write + IndexedDB backup, save-state indicator, recovery-on-open prompt, `beforeunload` guard. This is the highest data-loss-risk phase — do not skip its integration tests.
7. **FallbackFileSystemAdapter** (Compatibility NFRs): upload/download mode, capability-detected switch, visible mode indicator.
8. **Reliability edge cases**: external-modification check, permission-revocation handling, disk-full handling (Architecture.md §3, §8).
9. **Accessibility & theming pass**: keyboard nav, ARIA roles, WCAG AA contrast in both themes.
10. **PWA/offline**: Workbox service worker, app-shell precache.
11. **Observability wiring**: `ErrorReporter` no-op default; leave concrete backend as a config seam (don't hardcode a vendor).

Do not jump to phase 6+ before phases 2–5 have passing tests — autosave and reliability logic assume a working, tested file-I/O and rendering layer underneath.

## Non-negotiable checks before marking any phase done

- [ ] Feature maps to an FR-ID in `specification.md` — cite it in the PR/commit description.
- [ ] No new `[innerHTML]` binding bypasses `MarkdownRenderer.renderSafe()`.
- [ ] No new HTTP call added to any file-content code path.
- [ ] New platform I/O goes through an adapter interface, not called directly from a component.
- [ ] Corresponding unit/integration/E2E test added (see CLAUDE.md testing expectations) — cite which one.
- [ ] If touching autosave, save-conflict, or sanitization: flagged as critical-path in the PR description.

## Common pitfalls specific to this build (from the source business doc's emphasis)

- Treating autosave as a "nice to have" and skipping the IndexedDB-backup independence requirement — the two writes (disk, IndexedDB) must not share a failure mode.
- Sanitizing at the call site instead of inside `MarkdownRenderer` — creates a second, unsanitized render path over time.
- Building fallback mode as an afterthought — it's a permanent supported mode per business decision, not a stub.
- Virtualizing the editor's rendering but forgetting the file tree, or vice versa — both are explicit performance requirements.

## Escalate to the user instead of deciding alone when

- A requirement in `specification.md` conflicts with what's easiest to implement.
- A change would touch the reserved auth/entitlement seam (Architecture.md §9).
- Firefox/Safari manual test pass reveals fallback mode doesn't actually work — this blocks the "fallback is acceptable" decision the business already made.
