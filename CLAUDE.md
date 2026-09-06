# CLAUDE.md — Project Instructions

This file guides Claude Code (or any AI assistant) working in this repository. All authoritative product/design docs live in **`doc/`** — read `doc/specification.md` and `doc/Architecture.md` before making non-trivial changes; they are the source of truth for requirements and structure, not this file. `doc/skill.md` defines the build-order workflow (also invokable as the `md-editor-build` skill). `doc/Product_Markdown_Editor_Build_Prompt.md` (if present there) is the original business ask these were derived from.

Treat `doc/` as the first place to check for context on any future task in this repo, and the place new/updated design docs belong — don't scatter planning docs elsewhere.

## What this project is

A local-first, browser-based Markdown/text file editor (Angular + CodeMirror 6). No backend, no accounts, zero upload of file content. See `doc/specification.md` §1–2 for scope and `doc/Architecture.md` §1 for the layering model.

## Hard rules — do not violate without explicit user sign-off

1. **Never send file content over the network.** No HTTP client may be injected into any service that touches file content (`FileOperationsService`, `MarkdownRenderer`, autosave/backup paths). This is architectural, not a lint suggestion — see doc/Architecture.md §7.
2. **Never render Markdown-derived HTML without passing it through `MarkdownRenderer.renderSafe()`** (DOMPurify-backed). There must be exactly one exported render path. Do not add a second `[innerHTML]` binding that bypasses it.
3. **Never implement Save as a "download a copy."** In native mode, save writes to the original file handle in place. Only the fallback adapter downloads.
4. **Never build a custom `contentEditable` editor.** CodeMirror 6 is the only editor component (locked in the business build prompt).
5. **Delete operations require an explicit confirm dialog.** No silent/optimistic deletes.
6. **Don't scatter File System Access API calls into components.** All platform I/O goes through the `FileSystemAdapter` interface (doc/Architecture.md §2.1) so native/fallback stays swappable and testable.
7. **No accounts/auth/billing code in v1.** The architecture reserves a seam for a future paid tier (doc/Architecture.md §9) — don't build ahead of that; don't build in a way that forecloses it either (e.g. don't hardcode a single global singleton where a per-session scope was specified).

## Before writing code

- Map the change to an FR-ID in `doc/specification.md` §3 or an explicit architecture note in `doc/Architecture.md`. If it doesn't map to either, flag it — don't silently expand scope.
- If a change touches Section 3.4 (autosave/data safety), 3.5 (preview/sanitization), or the security boundary in doc/Architecture.md §7, treat it as security/data-loss-critical: it needs a corresponding test (unit or integration), not just a manual check.

## Testing expectations

- Unit tests for anything in `/core` or `/adapters/markdown` (sanitization especially — extend the XSS payload corpus rather than writing one-off cases).
- Integration tests for anything in `/adapters/filesystem` and `FileOperationsService`, using the mocked `FileSystemHandle` fixtures — don't add a new CRUD path without a corresponding mocked-adapter test.
- New user-facing flows need a Playwright E2E spec under `/e2e`, mapped to a user story ID from `doc/specification.md` §2.
- Run the full suite before claiming a task done. If you can't run Playwright/E2E in the current environment, say so explicitly rather than claiming it passed.

## Style / conventions

- Standalone Angular components, signals for local state (doc/Architecture.md §3) — avoid introducing NgModules or a second state-management library without discussion.
- Services depend on interfaces (`FileSystemAdapter`, `MarkdownRenderer`, `ErrorReporter`, `BackupStore`), never on concrete platform APIs directly.
- Error messages shown to users must be actionable, not raw exceptions ("Couldn't save — the file may have been moved or deleted", not a stack trace).
- No comments explaining *what* code does; only *why*, and only when non-obvious (matches repo-wide expectations, not specific to this project).

## Open / deferred items (don't resolve unilaterally)

- Concrete Sentry DSN / CI provider — infra decision, not yet made. `ErrorReporter` ships a no-op default; don't hardcode a specific vendor config.
- Exact shape of the post-v1 paid-tier/entitlement model — only the seam is reserved (doc/Architecture.md §9), nothing more should be built now.

## When in doubt

Prefer asking over guessing on anything touching: data-loss risk (autosave/save-conflict logic), security (sanitization, CSP), or scope boundaries (v1 vs. v2 features like cross-file search). These are called out as critical paths in the spec, not incidental details.
