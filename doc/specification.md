# Specification — Markdown & Text File Editor (v1)

Status: Draft for review — no implementation started.
Source: `Product_Markdown_Editor_Build_Prompt.md` (business build prompt)
Decisions confirmed with business/product owner on 2026-09-06:

| Open decision (from source doc) | Resolution |
|---|---|
| Hosted SaaS vs. self-hostable/OSS | **Open-source, self-hosted.** Static build, no backend required to run the app. |
| Monetization in v1? | **None.** No billing, no license gating, no accounts in v1. Architecture must leave a clean seam (pluggable auth/entitlement boundary) to add a paid tier after ~1 year without a rewrite. |
| Firefox/Safari fallback acceptable? | **Yes, permanently.** Fallback (upload/download) is a first-class, permanently supported mode — not a stopgap. No Electron/Tauri packaging in v1. |
| Error-monitoring backend / CI provider | **Not yet decided.** Spec defines the integration point (Sentry-compatible client SDK behind an interface); concrete DSN/CI provider is an infra TODO, not a blocker for build.

---

## 1. Purpose & Scope

A local-first, browser-based editor for Markdown and plain-text files, operating directly on a user-granted folder on their real file system, with no server-side storage or transmission of file content. v1 targets a single user, no accounts, no collaboration.

## 2. User Stories (normative — each maps to an acceptance criterion)

| ID | Story | Priority |
|---|---|---|
| US-1 | As a user, I can open a local folder and browse it as a tree. | Must |
| US-2 | As a user, I can open a `.md` or `.txt` file and see its content in an editor. | Must |
| US-3 | As a user, I can see a live-rendered, sanitized Markdown preview beside the raw source. | Must |
| US-4 | As a user, I can edit a file and save it back to disk in place (Ctrl/Cmd+S). | Must |
| US-5 | As a user, my edits autosave to disk and are backed up to IndexedDB so a crash/close doesn't lose work. | Must |
| US-6 | As a user, I can create, rename, duplicate, and delete files/folders, with confirmation on delete. | Must |
| US-7 | As a user, I can find/replace within the open file. | Must |
| US-8 | As a user on Firefox/Safari, I get a working fallback (upload → edit → download) with the mode clearly labeled. | Must |
| US-9 | As a user, I'm warned if the file changed externally before my save would overwrite it. | Must |
| US-10 | As a user, I can operate the whole app via keyboard only. | Must |
| US-11 | As a user, the app works fully offline after first load. | Must |
| US-12 (v2) | As a user, I can search across all files in the opened folder. | Out of scope v1 |

## 3. Functional Requirements

Numbered FR- IDs below are the traceability anchor for design docs and tests. Each restates a requirement from the business doc in testable form.

### 3.1 File Explorer
- FR-1: Render opened folder as a collapsible tree; virtualize rows (windowed rendering) — no full-DOM render for large trees.
- FR-2: Distinct icon per file class: `.md`, `.txt`, other.
- FR-3: Context menu (right-click and keyboard-equivalent) with New File, New Folder, Rename, Delete, Duplicate.
- FR-4: Persist folder permission grant across sessions where the File System Access API supports `queryPermission`/`requestPermission` persistence; re-prompt when not supported or when permission has lapsed.

### 3.2 File Operations
- FR-5: Open/Create/Rename/Delete/Duplicate operate on real `FileSystemHandle`s, not in-memory copies.
- FR-6: Delete requires an explicit confirm dialog naming the target; irreversible, no undo.
- FR-7: Save writes to the original file via a writable stream obtained from the existing handle — never "save as a new download" when native access is active.

### 3.3 Editor
- FR-8: Editor component is CodeMirror 6. No custom `contentEditable` implementation.
- FR-9: Markdown syntax highlighting: headers, emphasis, links, fenced code, lists.
- FR-10: Line numbers, word-wrap toggle, in-file find/replace, standard shortcuts (Save, Find, Undo/Redo).

### 3.4 Autosave & Data Safety
- FR-11: Debounced disk autosave, 2–3s after last keystroke (configurable constant).
- FR-12: Parallel, independent write of unsaved content to IndexedDB on every debounce tick, decoupled from disk-write success/failure.
- FR-13: On file open, compare IndexedDB backup timestamp to on-disk last-saved timestamp; if backup is newer, prompt user to recover or discard.
- FR-14: Persistent save-state indicator with exactly these states: `Saved`, `Saving…`, `Unsaved changes`, `Error saving — [reason]`.
- FR-15: `beforeunload` handler blocks/warns on tab close with unsaved changes.

### 3.5 Markdown Preview
- FR-16: Live preview pane, toggleable/side-by-side, using `markdown-it` or `remark`/`unified`.
- FR-17: GFM support: tables, task lists, strikethrough, fenced code with syntax highlighting, autolinks.
- FR-18 (**security-critical**): All rendered HTML passes through DOMPurify (or equivalent) before DOM injection. No code path bypasses this. Verified by adversarial unit tests (see §7).
- FR-19: Scroll-sync between editor and preview.
- FR-20: Relative local image paths resolve within the granted folder scope only (no path escape); absolute `http(s)` image URLs render normally.

### 3.6 Plain Text Support
- FR-21: `.txt` and other UTF-8 text files open in the same editor; Markdown preview pane is hidden/disabled for non-`.md` files.
- FR-22: Binary/non-UTF-8 detection on open; show explicit warning, do not attempt render, do not silently corrupt on save-back.

### 3.7 Search
- FR-23: In-file find, highlight-all, next/previous navigation.
- FR-24 (v2, explicitly deferred): Cross-file search across the opened folder.

## 4. Non-Functional Requirements

| Category | Requirement | Verification |
|---|---|---|
| Performance | Responsive editor input, no perceptible lag, files up to 5–10 MB | Manual + perf test with synthetic large file |
| Performance | Tree does not block UI thread on folders with hundreds of files | Virtualization required; perf test |
| Performance | Preview re-render debounced 150–300ms | Unit test on debounce timing |
| Compatibility | Runtime feature-detect File System Access API; auto-fallback to `<input type="file">` + download when unsupported | E2E on Chromium + manual pass on Firefox/Safari |
| Compatibility | Active mode (native vs. fallback) always visibly indicated | E2E assertion on UI badge/label |
| Security | DOMPurify sanitization mandatory, no bypass path | Unit tests with XSS payload corpus |
| Security | Zero network transmission of file content | Static analysis / network request audit in E2E (assert no upload requests fire) |
| Security | CSP blocking inline script execution | Header/meta present in build; automated check in CI |
| Reliability | Every save failure surfaces a visible, actionable message | Unit + E2E fault injection |
| Reliability | Detect: external file modification, revoked permission mid-session, disk-full, deleted/moved folder | Integration tests with mocked FS API errors |
| Reliability | Warn before overwrite when file changed externally since open | Integration test simulating external mtime change |
| Accessibility | Full keyboard navigation, no mouse-only path | Manual audit + automated a11y test (axe) |
| Accessibility | ARIA treeview pattern on file tree; correct roles on toolbar | Automated a11y test |
| Accessibility | WCAG 2.1 AA contrast, light + dark themes | Automated contrast check both themes |
| Offline | PWA with service worker (`@angular/service-worker`, not raw Workbox — see doc/Architecture.md §6); app shell + core function offline after first load | E2E with network disabled |
| Observability | Client error monitoring wired behind an interface (concrete backend TBD); never logs file content, only error metadata | Code review + unit test asserting no content in error payloads |
| Testing | Unit, integration, E2E (Playwright) suites required, passing in CI before "production-ready" claim | CI gate |

## 5. Explicitly Out of Scope (v1)

- Accounts, authentication, cloud storage (v1) — architecture reserves a seam for this post-v1
- Real-time multi-user collaboration
- Cross-file search
- Native desktop packaging (Electron/Tauri)
- Billing/monetization (v1)

## 6. Acceptance Criteria (Definition of Done)

Mirrors the business doc's checklist, each item traceable to FR-IDs above:

- [ ] US-1/FR-1 — Open folder, working file tree
- [ ] US-2,4/FR-5,7 — Open, edit, save `.md` file; persisted to real disk file
- [ ] US-3/FR-16-18 — Live preview renders, verified sanitized against an XSS payload corpus
- [ ] US-5/FR-11-15 — Autosave + crash recovery function; tested via forced tab-close mid-edit
- [ ] US-6/FR-3,5,6 — Create/rename/delete with confirmation and validation
- [ ] US-8/FR-… — Fallback mode functions on non-Chromium browser, mode is visibly labeled
- [ ] US-10 — Full keyboard navigation, no mouse required
- [ ] Automated suite (unit + integration + e2e) green in CI
- [ ] US-11 — App loads and functions with no network after first visit

## 7. Test Strategy Summary

- **Unit**: Markdown parse/render; DOMPurify sanitization against a maintained XSS payload corpus (not a single smoke case); debounce timing; save-state reducer.
- **Integration**: File CRUD against a mocked File System Access API (handle mocks); IndexedDB backup/recovery flow; external-modification and permission-revocation scenarios.
- **E2E (Playwright, Chromium)**: Every US-1..11 story as a scripted flow.
- **Manual**: Firefox/Safari fallback pass, confirmed each release since fallback is a permanent supported mode, not a stopgap.

## 8. Open Items Carried Forward (non-blocking for build start)

- Concrete Sentry project / DSN and CI provider — infra decision, deferred; code integrates against an abstracted error-reporting interface so the concrete backend can be swapped in later without touching call sites.
- Exact shape of the future paid-tier/auth boundary — not designed in detail for v1, but Architecture.md reserves the seam (see Architecture §9).
