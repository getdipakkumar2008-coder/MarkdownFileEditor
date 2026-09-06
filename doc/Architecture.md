# Architecture — Markdown & Text File Editor (v1)

Status: v1 implemented — see `specification.md`'s Status line for current verification state. Companion to `specification.md`. Read that first for the *what*; this is the *how*.

## 1. Architectural Style

Single-page Angular application, statically built, deployed with no required backend. All I/O is client-local (File System Access API or fallback) or client-storage (IndexedDB). The only network calls in v1 are: (a) initial asset load, (b) optional outbound error-monitoring events (metadata only, never file content). This is a hard boundary, not a preference — see §7.

Layering (top to bottom, each layer depends only downward):

```
┌─────────────────────────────────────────────────────┐
│ Presentation (Angular components, standalone)        │
│  FileTree · Toolbar · EditorPane · PreviewPane ·      │
│  SaveStateIndicator · Dialogs (confirm/recover)       │
├─────────────────────────────────────────────────────┤
│ Application services (framework-light, testable)      │
│  WorkspaceService · FileOperationsService ·           │
│  AutosaveService · SearchService                       │
├─────────────────────────────────────────────────────┤
│ Domain adapters (interfaces + swappable impls)         │
│  FileSystemAdapter (Native | Fallback)                 │
│  MarkdownRenderer (markdown-it/remark + DOMPurify)      │
│  BackupStore (IndexedDB)                                │
│  ErrorReporter (Sentry-compatible, backend TBD)          │
├─────────────────────────────────────────────────────┤
│ Platform APIs                                            │
│  File System Access API · <input type=file> · IndexedDB │
│  Service Worker (Workbox) · CodeMirror 6                  │
└─────────────────────────────────────────────────────┘
```

Rule: presentation components never touch a platform API directly. They call application services, which call domain adapters through interfaces. This is what makes the native/fallback split and the future auth seam possible without touching UI code.

## 2. Module Breakdown

### 2.1 `FileSystemAdapter` (interface)

```ts
interface FileSystemAdapter {
  readonly mode: 'native' | 'fallback';
  openFolder(): Promise<FolderHandle>;
  listChildren(folder: FolderHandle): Promise<TreeEntry[]>;
  readFile(handle: FileHandle): Promise<{content: string; lastModified: number}>;
  writeFile(handle: FileHandle, content: string): Promise<void>;
  createFile(parent: FolderHandle, name: string): Promise<FileHandle>;
  createFolder(parent: FolderHandle, name: string): Promise<FolderHandle>;
  rename(handle: FileHandle | FolderHandle, newName: string): Promise<void>;
  duplicate(handle: FileHandle): Promise<FileHandle>;
  delete(handle: FileHandle | FolderHandle): Promise<void>;
  requestPersistedPermission(folder: FolderHandle): Promise<'granted'|'denied'|'prompt'>;
}
```

- **NativeFileSystemAdapter**: wraps `showDirectoryPicker`, `FileSystemFileHandle.createWritable()`, permission persistence via `queryPermission`/`requestPermission`.
- **FallbackFileSystemAdapter**: wraps `<input type="file webkitdirectory>` for open, builds an in-memory virtual tree, and on save triggers a browser download of the modified file (filename preserved). `mode` is exposed to the UI so `SaveStateIndicator`/toolbar can always show which mode is active (FR from spec §4, Compatibility row).
- Selection logic: a `FileSystemCapabilityDetector` runs once at boot (`'showDirectoryPicker' in window`), never per-operation, and picks the adapter via DI token — no runtime branching scattered through components.

### 2.2 `AutosaveService`

Owns the debounce timer (2–3s, configurable) and coordinates two independent writes on each tick:
1. `FileOperationsService.save()` → disk via `FileSystemAdapter.writeFile`
2. `BackupStore.put()` → IndexedDB

These are intentionally decoupled — a disk-write failure (permission revoked, disk full) must not prevent the IndexedDB backup from succeeding, since the backup exists precisely to survive disk-write failure. `AutosaveService` exposes a state machine (`Saved | Saving | Unsaved | Error`) consumed by `SaveStateIndicator`.

Recovery flow on file open: compare `BackupStore` entry's timestamp for that file path against `lastModified` from `readFile()`. If backup is newer, surface a recovery prompt (component, not a silent auto-merge) — user chooses keep-backup or discard.

### 2.3 `MarkdownRenderer`

Single-purpose pipeline, no shortcuts:

```
raw markdown → markdown-it/remark (GFM) → raw HTML → DOMPurify.sanitize() → render
```

`DOMPurify.sanitize()` is called inside the renderer service itself, not left to call sites — there is exactly one function (`renderSafe()`) that produces HTML fit for `[innerHTML]` binding, and it is the only exported render function. This closes the "someone forgets to sanitize at a new call site" failure mode called out as security-critical in the spec.

Image resolution: relative paths are resolved against the currently open folder's handle tree (read-only `getFileHandle` traversal), converted to a local `blob:` URL for the `<img>` src. Paths that resolve outside the granted folder root are rejected, not silently ignored — this closes a path-traversal-flavored gap the business doc doesn't explicitly call out but which follows from "local image paths (within the granted folder scope)."

### 2.4 `ErrorReporter`

Thin interface (`report(error, metadata)`) with a no-op default implementation shipped in v1 and a Sentry-backed implementation gated behind a build-time config flag. Concrete DSN/project is an infra decision deferred per business input — this seam exists so wiring it later is a config change, not a code change. Hard rule enforced by a lint rule / code-review checklist item: `metadata` must never include file content, file paths beyond basename, or folder names.

## 3. State Management

Angular signals (or a lightweight store, e.g. `@ngrx/signals`) scoped per open workspace — no global mutable singletons beyond DI-scoped services. State shape:

```
Workspace
 ├─ rootHandle, mode ('native'|'fallback')
 ├─ tree: TreeEntry[] (virtualized, lazy-expanded)
 └─ openFile
     ├─ handle, path, content, dirty, saveState
     └─ lastKnownDiskMtime   ← used for external-modification detection
```

External-modification detection: before each save, re-`stat` (read `lastModified`) the handle and compare to `lastKnownDiskMtime` captured at open/last-save. Mismatch → block the overwrite, show a merge/overwrite-confirmation dialog rather than clobbering (spec FR under Reliability).

## 4. Editor Integration (CodeMirror 6)

- `@codemirror/lang-markdown` for syntax highlighting.
- Extensions composed, not monkey-patched: line numbers, search panel (`@codemirror/search`), history (undo/redo), keymap merging app shortcuts (Save/Find) with CodeMirror defaults.
- Preview re-render is driven by a `debounceTime(150–300ms)` operator on the editor's content-change stream, not on every keystroke — one clear ownership point for this timing, in `PreviewPane`, not scattered.
- Large-file handling (5–10MB target): rely on CodeMirror 6's native viewport-based rendering (it doesn't render the whole document to DOM); avoid any custom line-processing pass over the full content on every keystroke (e.g., don't recompute a full-document word count synchronously on `change`).

## 5. File Tree Virtualization

Windowed rendering (e.g. `cdk-virtual-scroll-viewport` from Angular CDK) over a flattened, lazily-expanded tree model — folders fetch children on expand (`listChildren`), not eagerly on folder-open, so a large repo-sized folder doesn't do one big upfront directory read.

## 6. PWA / Offline

- **Implemented via `@angular/service-worker`** (`ng add @angular/pwa`), not raw Workbox as originally sketched — it's the standard, well-integrated tool for an Angular CLI app and gives the same outcome (precached app shell, offline load after first visit) without hand-wiring a Workbox config alongside the Angular build. Config lives in `ngsw-config.json`; only takes effect in a production build (`ng build`), not `ng serve`.
- Precaches the app shell only: `index.html`, JS/CSS bundles, the manifest, and icon assets (`assetGroups` in `ngsw-config.json`) — `installMode: prefetch` for the shell, `lazy` for icons.
- No `dataGroups` and no offline caching of user file content — file content lives in the user's real files/handles, not in the SW cache. This keeps the offline story simple and avoids a second source of truth.
- Registration uses `registerWhenStable:30000` so the service worker doesn't compete with initial app boot for resources.

## 7. Security Boundary

- **Zero-upload guarantee**: enforced architecturally, not just by convention — no HTTP client/service in the app has access to file content; `FileOperationsService` and `MarkdownRenderer` never receive an injected HTTP client. A code-review checklist item and a CI grep-check (`no fetch/XHR call sites in file-content code paths`) back this.
- **CSP**: `script-src 'self'` (no `unsafe-inline`), set via a `<meta http-equiv>` in the static shell (no server to set real headers, since this is a static self-hosted build) plus documentation for operators who do serve it behind a real server to set the header form instead.
- **Sanitization**: see §2.3 — single choke point, tested against an XSS payload corpus (spec §7).

## 8. Testing Architecture

- **Unit** (Vitest, actually implemented — not Jest): pure functions and services — `MarkdownRenderer.renderSafe`, `AutosaveService` state machine, debounce utilities, `redactUnsafeMetadata`, `flattenTree`, `FocusTrapDirective`. `FileSystemAdapter` implementations tested against a hand-rolled mock of `FileSystemFileHandle`/`FileSystemDirectoryHandle`; IndexedDB-backed code (`IndexedDbBackupStore`) tested against `fake-indexeddb`.
- **Integration**: `FileOperationsService` + mocked adapter, covering CRUD, external-modification conflict, permission-revocation-mid-session, disk-full simulation (mock `createWritable` rejecting).
- **E2E** (Playwright — implementation in `e2e/`):
  - **Chromium project**: the real File System Access API can't be scripted from outside the browser (no OS-dialog automation), so Chromium specs inject an in-page mock via `page.addInitScript` (`e2e/support/mock-native-fs.ts`) that implements `showDirectoryPicker`/`FileSystemFileHandle`/`FileSystemDirectoryHandle` backed by an in-memory tree, and intercept it *before* app bootstrap. This is the same "mock the FS Access API for automated environments" approach doc/specification.md's own test strategy calls for at the integration-test level, extended one layer up to E2E — it exercises the app's real `NativeFileSystemAdapter` code, not a stub of it.
  - **Firefox project**: exercises `FallbackFileSystemAdapter`'s real `<input type="file" webkitdirectory>` path using Playwright's `setInputFiles`, since Firefox genuinely lacks `showDirectoryPicker` — no mocking needed here, the capability-detection fallback triggers naturally.
  - Covers: open folder → tree → open/edit/save a `.md` file; Markdown preview sanitization (XSS payload assertions); create/rename/delete/duplicate via the context menu; autosave + IndexedDB crash-recovery (via a real page reload, not a mocked one); keyboard-only tree/dialog navigation.
  - Not yet covered end-to-end: every US-1..11 permutation from the spec, and a real Safari/WebKit run (Playwright's `webkit` project is Apple's engine but not a substitute for actual Safari — that stays a manual check).
- **CI**: GitHub Actions, `.github/workflows/ci.yml` — on push/PR: `npm ci` → `ng build` → `vitest run` → `playwright test` (Chromium + Firefox projects, browsers installed via `npx playwright install --with-deps`).

## 9. Reserved Seam: Future Paid Tier / Auth (post-v1, not built now)

Per business direction, no accounts/billing in v1, but the architecture must not foreclose adding a paid tier ~1 year out. What this constrains **today**:

- No component or service assumes an anonymous/single-user model in a way that's hard to unwind — e.g., `WorkspaceService` is already scoped per-session rather than as a hardcoded global singleton, so a future `UserSession` concept can wrap it without a rewrite.
- `ErrorReporter` and any future `EntitlementService` follow the same DI-interface pattern as `FileSystemAdapter` — swap the implementation, not the call sites.
- No feature is architected to *require* server round-trips; a future paid tier (e.g., cross-file search-as-a-service, cloud sync) would be additive adapters behind the same interfaces, not a rewrite of the local-first core.

This is explicitly a seam, not a spec — no auth UI, no entitlement checks, no billing code ships in v1.

## 10. Suggested Repository Layout

```
/src
  /app
    /core           # DI tokens, interfaces (FileSystemAdapter, MarkdownRenderer, ErrorReporter, BackupStore)
    /adapters
      /filesystem   # native + fallback impls, capability detector
      /markdown     # renderer impl (markdown-it/remark + DOMPurify)
      /backup       # IndexedDB impl
      /telemetry    # no-op + Sentry impl
    /features
      /file-tree
      /editor
      /preview
      /toolbar
      /dialogs
    /state          # workspace/open-file signal store
  /assets
/e2e                # Playwright specs + support/mock-native-fs.ts
/ngsw-config.json    # Angular service worker precache config (§6 — not a /sw folder; no separate Workbox config)
/.github/workflows   # CI (§8)
```

## 11. Explicit Non-Goals (architectural, not just product)

- No server-side rendering, no SSR-hydration concerns.
- No multi-tenant data model — nothing to design for since there is no server-side data at all in v1.
- No design for concurrent multi-tab editing of the same file beyond the external-modification check in §3 — two tabs open on the same file is treated as "external modification," not as a merge scenario.

## 12. Runtime Resilience ("self-healing" / "self-evaluating")

Scoped deliberately narrow — this is about the *running app* recovering from its own failure modes, not an autonomous process that modifies the codebase (that's a separate, explicitly-gated concern — see §13).

- **Retry-with-backoff**: `FileOperationsService.save()` retries a write up to 2 times (300ms, then 900ms) only for the `'unknown'` error code — i.e. an unclassified platform failure that might be transient (a momentary OS-level lock, a flaky external drive). It does **not** retry `permission-revoked`, `external-modification`, `not-found`, or `disk-full` — those are correctly-classified conditions that need a human decision (via the existing save-issue dialog), and silently retrying past them would be exactly the "silently clobber" behavior the spec forbids.
- **Backup-store degradation**: if `IndexedDbBackupStore` itself fails to open (quota exceeded, browser storage corrupted, private-browsing restrictions), the app must not lose its primary function (saving to disk) — every `backupStore` call in the save/autosave path is wrapped so a backup failure degrades to "crash-recovery is unavailable this session" (reported once via `ErrorReporter`, not resurfaced on every keystroke) rather than blocking or crashing the disk-save path.
- **Update-available UI**: `SwUpdate` (from `@angular/service-worker`) is subscribed for `VERSION_READY` events; the app was already fetching updates in the background but never told the user — a small toast now offers "Reload to update."
- **CI health gates**: `npm audit --audit-level=high` runs in CI (fails the build on high/critical dependency vulnerabilities) alongside the existing build-time bundle budget (angular.json `budgets`, already enforced — a bundle-size regression fails the production build today, not a new mechanism).

Explicitly out of scope here: automatic dependency version bumps, automatic rollback of a bad deploy, and anything that writes to the repository on its own — see §13.

## 13. Autonomous Maintenance Agent — Resolved: Not Needed as a Standing Thing

The user asked whether this project could be made "self-upgrading" via an autonomous agent that monitors and patches the codebase. This is architecturally and operationally distinct from §12 — a *standing, unattended* agent means something has write access to the repository with no human in the loop per change, which is a real risk surface (a bad automated commit, a subtly-wrong "fix," credential/token exposure in a scheduled job).

**Resolution (discussed and closed, not just deferred)**: the question was whether this is *possible*, not a request to stand one up. Walking through the five guardrails below collapsed the ask into something much smaller than "autonomous agent":

1. **Trigger model — resolved: on-demand only.** No scheduled or event-triggered mode. The user (or a future session) explicitly asks for a maintenance pass (e.g. "check and bump dependencies") when they want one.
2. **Write boundary — moot under an on-demand trigger.** With a human present for every invocation, there's no unattended-commit scenario to gate against. A dependency-bump pass is just a normal session task: propose the change, human reviews the diff live, human says commit — the same flow already used throughout this project. No separate branch/PR ceremony needed beyond what any change already gets.
3. **Scope fence — resolved: dependency version bumps only.** Nothing else. Not CI config, not source code, not a general "fix things" mandate.
4. **Rollback plan — moot for the same reason as #2**: it's an ordinary commit a human watched happen; revert it the ordinary way if a bump breaks something.
5. **Secrets/credentials — moot.** No scoped token or unattended credential is needed for an on-demand, human-present task; it uses whatever access the session already has.

**Net effect**: there is no separate "autonomous agent" feature in this codebase, and none is planned. "Self-upgrading" in this project means: ask for a dependency-check pass when you want one, review it like any other change. If a genuinely unattended/scheduled mode is wanted later, this section's original five-point gate (scheduled trigger, PR-and-required-review boundary, explicit scope fence, a real rollback/notification plan, and a purpose-scoped credential) still applies and would need to be re-opened and agreed before building it.
