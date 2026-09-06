# Architecture UML + C4 Diagrams

Source architecture document: `doc/Architecture.md`

## 14. Code-Verified UML / Mermaid Views

This section translates the implemented v1 architecture into executable Mermaid diagrams.  
Companion sections: §1–§13 in this document and `doc/specification.md`.

> Verification note: keep these diagrams synchronized with actual source under:
> - `src/app/core` (interfaces/tokens)
> - `src/app/adapters` (native/fallback fs, markdown, backup, telemetry)
> - `src/app/features` (file-tree/editor/preview/toolbar/dialogs)
> - `src/app/state` (workspace/open-file state)
> - `e2e/` and unit/integration tests
> - `ngsw-config.json`, service-worker registration code, `.github/workflows/ci.yml`

### 14.1 Layered Component Diagram

```mermaid
flowchart TB
  subgraph L1["Presentation Layer (Angular standalone components)"]
    FileTree[FileTreeComponent]
    Toolbar[ToolbarComponent]
    EditorPane[EditorPaneComponent]
    PreviewPane[PreviewPaneComponent]
    SaveState[SaveStateIndicatorComponent]
    Dialogs["Dialogs: Confirm/Recover/Conflict"]
  end

  subgraph L2[Application Services Layer]
    WorkspaceSvc[WorkspaceService]
    FileOpsSvc[FileOperationsService]
    AutosaveSvc[AutosaveService]
    SearchSvc[SearchService]
  end

  subgraph L3["Domain Adapters Layer (interfaces + impls)"]
    FSAdapterI["FileSystemAdapter (interface)"]
    NativeFS[NativeFileSystemAdapter]
    FallbackFS[FallbackFileSystemAdapter]
    RendererI["MarkdownRenderer (interface)"]
    RendererImpl["MarkdownRendererImpl + DOMPurify"]
    BackupI["BackupStore (interface)"]
    IdbBackup[IndexedDbBackupStore]
    ErrI["ErrorReporter (interface)"]
    NoopErr[NoopErrorReporter]
    SentryErr[SentryErrorReporter]
    Capability[FileSystemCapabilityDetector]
  end

  subgraph L4["Platform APIs / Libraries"]
    FSAPI[File System Access API]
    InputFallback["input[type=file webkitdirectory] + browser download"]
    IDB[IndexedDB]
    SW[Angular Service Worker]
    CM6[CodeMirror 6]
    MDLib["markdown-it/remark"]
    Purify[DOMPurify]
  end

  %% Presentation -> Services
  FileTree --> WorkspaceSvc
  FileTree --> FileOpsSvc
  Toolbar --> FileOpsSvc
  Toolbar --> SearchSvc
  EditorPane --> FileOpsSvc
  EditorPane --> AutosaveSvc
  PreviewPane --> RendererI
  SaveState --> WorkspaceSvc
  Dialogs --> WorkspaceSvc
  Dialogs --> FileOpsSvc

  %% Services -> Adapters
  WorkspaceSvc --> FSAdapterI
  FileOpsSvc --> FSAdapterI
  FileOpsSvc --> BackupI
  FileOpsSvc --> ErrI
  AutosaveSvc --> FileOpsSvc
  AutosaveSvc --> BackupI
  SearchSvc --> WorkspaceSvc

  %% Adapter bindings
  FSAdapterI --> NativeFS
  FSAdapterI --> FallbackFS
  RendererI --> RendererImpl
  BackupI --> IdbBackup
  ErrI --> NoopErr
  ErrI --> SentryErr
  Capability --> NativeFS
  Capability --> FallbackFS

  %% Adapters -> Platform
  NativeFS --> FSAPI
  FallbackFS --> InputFallback
  IdbBackup --> IDB
  RendererImpl --> MDLib
  RendererImpl --> Purify
  EditorPane --> CM6
  WorkspaceSvc --> SW
```

### 14.2 Class Diagram (Contracts + Implementations)

```mermaid
classDiagram
  class FileSystemAdapter {
    <<interface>>
    +mode: 'native' | 'fallback'
    +openFolder() Promise~FolderHandle~
    +listChildren(folder) Promise~TreeEntry[]~
    +readFile(handle) Promise~ReadResult~
    +writeFile(handle, content) Promise~void~
    +createFile(parent, name) Promise~FileHandle~
    +createFolder(parent, name) Promise~FolderHandle~
    +rename(handle, newName) Promise~void~
    +duplicate(handle) Promise~FileHandle~
    +delete(handle) Promise~void~
    +requestPersistedPermission(folder) Promise~PermissionState~
  }

  class NativeFileSystemAdapter
  class FallbackFileSystemAdapter
  FileSystemAdapter <|.. NativeFileSystemAdapter
  FileSystemAdapter <|.. FallbackFileSystemAdapter

  class MarkdownRenderer {
    <<interface>>
    +renderSafe(markdown, context) string
  }
  class MarkdownRendererImpl {
    +renderSafe(markdown, context) string
    -resolveRelativeImages(...)
    -sanitize(html)
  }
  MarkdownRenderer <|.. MarkdownRendererImpl

  class BackupStore {
    <<interface>>
    +put(path, content, timestamp) Promise~void~
    +get(path) Promise~BackupEntry?~
    +delete(path) Promise~void~
  }
  class IndexedDbBackupStore
  BackupStore <|.. IndexedDbBackupStore

  class ErrorReporter {
    <<interface>>
    +report(error, metadata) void
  }
  class NoopErrorReporter
  class SentryErrorReporter
  ErrorReporter <|.. NoopErrorReporter
  ErrorReporter <|.. SentryErrorReporter

  class WorkspaceService {
    +workspaceState$
    +openWorkspace()
    +setOpenFile(...)
    +setSaveState(...)
  }

  class FileOperationsService {
    +openFile(handle)
    +save(file, content)
    +create(...)
    +rename(...)
    +delete(...)
    +duplicate(...)
    -checkExternalModification(...)
    -retryUnknownWriteFailure(...)
  }

  class AutosaveService {
    +start(file)
    +stop()
    -onDebouncedTick()
  }

  class SearchService {
    +findInFile(query)
    +findInTree(query)
  }

  WorkspaceService --> FileSystemAdapter : uses
  FileOperationsService --> FileSystemAdapter : uses
  FileOperationsService --> BackupStore : backup/recovery metadata
  FileOperationsService --> ErrorReporter : reports failures
  AutosaveService --> FileOperationsService : save()
  AutosaveService --> BackupStore : put()
  SearchService --> WorkspaceService : reads tree/open file
```

### 14.3 Sequence Diagram — Open → Edit → Autosave → Backup

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant EP as EditorPane
  participant AS as AutosaveService
  participant FO as FileOperationsService
  participant FS as FileSystemAdapter
  participant BS as BackupStore
  participant WS as WorkspaceService

  U->>EP: Edit markdown content
  EP->>AS: contentChanged(path, content)
  AS->>AS: debounce(2-3s)

  AS->>FO: save(path, content)
  FO->>FS: readFile(handle) / stat lastModified
  FS-->>FO: {content,lastModified}
  FO->>FO: compare with lastKnownDiskMtime

  alt external modification detected
    FO-->>WS: setSaveState(CONFLICT)
    WS-->>EP: show conflict dialog
  else safe to write
    FO->>FS: writeFile(handle, content)
    alt unknown transient failure
      FO->>FO: retry 300ms
      FO->>FS: writeFile(handle, content)
      FO->>FO: retry 900ms
      FO->>FS: writeFile(handle, content)
    end
    FS-->>FO: success
    FO-->>WS: setSaveState(SAVED)
  end

  par backup path is independent
    AS->>BS: put(path, content, now)
    BS-->>AS: success/failure
  and disk save path
    AS-->>AS: handled via FO branch above
  end

  alt backup store failure
    AS-->>WS: non-blocking warning (degraded backup)
  end
```

### 14.4 Sequence Diagram — Recovery Prompt on File Open

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant FO as FileOperationsService
  participant FS as FileSystemAdapter
  participant BS as BackupStore
  participant D as RecoveryDialog
  participant WS as WorkspaceService

  U->>FO: openFile(handle, path)
  FO->>FS: readFile(handle)
  FS-->>FO: diskContent + diskMtime
  FO->>BS: get(path)
  BS-->>FO: backupContent? + backupTimestamp?

  alt backupTimestamp > diskMtime
    FO->>D: promptRecover(disk vs backup)
    D-->>U: choose version
    alt user picks backup
      FO-->>WS: setOpenFile(backupContent, dirty=true)
    else user keeps disk
      FO-->>WS: setOpenFile(diskContent, dirty=false)
    end
  else no newer backup
    FO-->>WS: setOpenFile(diskContent, dirty=false)
  end
```

### 14.5 State Diagram — Open File Lifecycle

```mermaid
stateDiagram-v2
  [*] --> NoFileOpen
  NoFileOpen --> Clean : openFile()

  Clean --> Dirty : edit
  Dirty --> Saving : manualSave/autosaveTick
  Saving --> Saved : write success
  Saved --> Clean : state settle

  Saving --> SaveError : write failed (non-conflict)
  SaveError --> Saving : retry/manual save

  Saving --> Conflict : external mtime mismatch
  Conflict --> Dirty : user resolves and keeps local edits
  Conflict --> Clean : user reloads disk version

  Dirty --> RecoveryPending : open detected newer backup
  RecoveryPending --> Dirty : choose backup
  RecoveryPending --> Clean : choose disk

  Clean --> [*] : close file/workspace
  Dirty --> [*] : close with confirm
```

### 14.6 Deployment / Runtime Diagram (Browser-only v1)

```mermaid
flowchart LR
  User[User]
  Browser[Browser Runtime]
  App[Angular SPA]
  SW[Angular Service Worker]
  IDB[(IndexedDB BackupStore)]
  FSNative[File System Access API]
  FSFallback["Input-file + Download fallback"]
  LocalFiles[(User local files)]

  User --> Browser
  Browser --> App
  App --> SW
  App --> IDB

  App --> FSNative
  App --> FSFallback

  FSNative <--> LocalFiles
  FSFallback <--> LocalFiles

  note1[No backend required in v1\nNo user file-content upload path]
  App --- note1
```

### 14.7 Diagram-to-Code Mapping (fill/verify during maintenance)

| Diagram element | Expected implementation area |
|---|---|
| `FileSystemAdapter` + impls | `src/app/core/*` + `src/app/adapters/filesystem/*` |
| `MarkdownRenderer` pipeline | `src/app/adapters/markdown/*` |
| `BackupStore` (IndexedDB) | `src/app/adapters/backup/*` |
| `ErrorReporter` no-op/Sentry seam | `src/app/adapters/telemetry/*` |
| `WorkspaceService`, `FileOperationsService`, `AutosaveService`, `SearchService` | `src/app/**/**.service.ts` |
| File tree/editor/preview/dialog interactions | `src/app/features/*` |
| Recovery/conflict/autosave behavior assertions | unit/integration tests + `e2e/*` |
| SW/offline shell caching | `ngsw-config.json` + app bootstrap SW registration |
| CI gates (`build`, `vitest`, `playwright`, audit/budgets if enabled) | `.github/workflows/ci.yml` |

### 14.8 What is required to keep these diagrams trustworthy

1. **Single source of truth rule**: if service/adapter contracts change, update §14 in same PR.
2. **Traceability check in PR template**: “Architecture/UML touched? yes/no”.
3. **Test evidence links**: every sequence diagram should be backed by at least one test suite (unit/integration/e2e).
4. **Doc drift gate**: lightweight CI script can grep for key interfaces/services and fail if missing from diagram mapping table.
5. **Version tag**: add a short line under §14 title: “Last verified against commit `<sha>`”.

## 15. C4-Style Mermaid Views (v1)

This section provides a C4-style architecture view of the Markdown & Text File Editor using Mermaid.
Scope is v1 as defined in this document and `doc/specification.md`.

### 15.1 System Context (C4 Level 1)

```mermaid
flowchart TB
  user["Person: User<br/>Edits markdown/text files locally in browser"]

  app["System: Markdown & Text File Editor (Angular SPA)<br/>Purpose: local editing, preview, file operations, autosave backups"]

  localfs["External System: User Local File System<br/>(via File System Access API or fallback input/download)"]
  idb["External System: Browser IndexedDB<br/>Crash-recovery backups"]
  sw["External System: Browser Service Worker Runtime<br/>Offline app-shell caching"]
  telemetry["External System (Optional): Error Telemetry Endpoint<br/>(Sentry-compatible, build-flag gated)"]

  user -->|"open/edit/save/search/preview"| app
  app -->|"read/write files"| localfs
  app -->|"store/retrieve backup snapshots"| idb
  app -->|"register/update app shell cache"| sw
  app -.->|"report errors metadata-only (optional)"| telemetry
```

### 15.2 Container View (C4 Level 2)

```mermaid
flowchart LR
  subgraph browser["Container: Browser Runtime"]
    subgraph spa["Container: Angular Single-Page Application"]
      ui["UI Layer<br/>file-tree, editor, preview, toolbar, dialogs"]
      appsvc["Application Services<br/>WorkspaceService, FileOperationsService,<br/>AutosaveService, SearchService"]
      adapters["Adapter Layer<br/>FileSystemAdapter, MarkdownRenderer,<br/>BackupStore, ErrorReporter"]
      state["State Store<br/>signals/@ngrx-signals workspace state"]
    end

    cm["Container: CodeMirror 6"]
    idb["Container: IndexedDB"]
    sw["Container: Angular Service Worker"]
    fsapi["Container: File System Access API"]
    fallback["Container: Fallback File I/O<br/>(input[webkitdirectory] + browser download)"]
    md["Container: markdown-it/remark"]
    purify["Container: DOMPurify"]
  end

  ui --> appsvc
  appsvc --> adapters
  appsvc <--> state

  ui --> cm
  adapters --> md
  adapters --> purify
  adapters --> idb
  adapters --> fsapi
  adapters --> fallback

  spa --> sw
```

### 15.3 Component View — Angular SPA (C4 Level 3)

```mermaid
flowchart TB
  subgraph presentation["Components: Presentation"]
    c_tree["FileTreeComponent"]
    c_toolbar["ToolbarComponent"]
    c_editor["EditorPaneComponent"]
    c_preview["PreviewPaneComponent"]
    c_save["SaveStateIndicatorComponent"]
    c_dialog["Dialogs (recover/conflict/confirm)"]
  end

  subgraph services["Components: Application Services"]
    s_workspace["WorkspaceService"]
    s_fileops["FileOperationsService"]
    s_autosave["AutosaveService"]
    s_search["SearchService"]
  end

  subgraph contracts["Components: Domain Contracts"]
    i_fs["FileSystemAdapter (interface)"]
    i_render["MarkdownRenderer (interface)"]
    i_backup["BackupStore (interface)"]
    i_error["ErrorReporter (interface)"]
  end

  subgraph impl["Components: Adapter Implementations"]
    a_detect["FileSystemCapabilityDetector"]
    a_native["NativeFileSystemAdapter"]
    a_fallback["FallbackFileSystemAdapter"]
    a_md["MarkdownRendererImpl"]
    a_bak["IndexedDbBackupStore"]
    a_noop["NoopErrorReporter"]
    a_sentry["SentryErrorReporter"]
  end

  subgraph platform["External Dependencies"]
    p_fs["File System Access API"]
    p_input["input[webkitdirectory] + download"]
    p_idb["IndexedDB"]
    p_md["markdown-it/remark"]
    p_purify["DOMPurify"]
    p_sw["Angular Service Worker APIs"]
    p_cm["CodeMirror 6"]
  end

  c_tree --> s_workspace
  c_tree --> s_fileops
  c_toolbar --> s_fileops
  c_toolbar --> s_search
  c_editor --> s_fileops
  c_editor --> s_autosave
  c_editor --> p_cm
  c_preview --> i_render
  c_save --> s_workspace
  c_dialog --> s_workspace
  c_dialog --> s_fileops

  s_workspace --> i_fs
  s_workspace --> p_sw
  s_fileops --> i_fs
  s_fileops --> i_backup
  s_fileops --> i_error
  s_autosave --> s_fileops
  s_autosave --> i_backup
  s_search --> s_workspace

  i_fs --> a_native
  i_fs --> a_fallback
  a_detect --> a_native
  a_detect --> a_fallback

  i_render --> a_md
  a_md --> p_md
  a_md --> p_purify

  i_backup --> a_bak
  a_bak --> p_idb

  i_error --> a_noop
  i_error --> a_sentry

  a_native --> p_fs
  a_fallback --> p_input
```

### 15.4 Dynamic View — “Open → Edit → Autosave” (C4 Level 4-style runtime flow)

```mermaid
sequenceDiagram
  autonumber
  participant User
  participant Editor as EditorPaneComponent
  participant Autosave as AutosaveService
  participant FileOps as FileOperationsService
  participant FS as FileSystemAdapter
  participant Backup as BackupStore
  participant WS as WorkspaceService

  User->>Editor: edit content
  Editor->>Autosave: onContentChange(path, content)
  Autosave->>Autosave: debounce(2-3s)
  Autosave->>FileOps: save(path, content)
  FileOps->>FS: readFile/stat for mtime check
  FS-->>FileOps: lastModified

  alt mtime mismatch
    FileOps-->>WS: saveState=CONFLICT
  else safe write
    FileOps->>FS: writeFile(handle, content)
    FS-->>FileOps: success
    FileOps-->>WS: saveState=SAVED
  end

  par independent backup
    Autosave->>Backup: put(path, content, timestamp)
    Backup-->>Autosave: success/failure
  and disk path
    Autosave-->>Autosave: handled via FileOps branch
  end
```

### 15.5 Deployment View (C4 Deployment-style simplified)

```mermaid
flowchart LR
  device["User Device"]
  browser["Browser Process"]

  subgraph appnode["Web App Node (static hosting output)"]
    shell["index.html + JS/CSS bundles + assets"]
  end

  subgraph runtime["Browser Runtime Node"]
    spa["Angular SPA"]
    sw["Service Worker"]
    idb["IndexedDB"]
    local["Local Files/Handles"]
  end

  device --> browser
  shell --> spa
  spa --> sw
  spa <--> idb
  spa <--> local
```

### 15.6 C4 Diagram Maintenance Checklist

- Update these diagrams whenever contracts in `src/app/core` change.
- If any service ownership changes (`FileOperationsService`, `AutosaveService`, etc.), update 15.3 + 15.4 in same PR.
- Keep fallback/native behavior explicit in diagrams whenever `FileSystemAdapter` behavior changes.
- Keep telemetry optional path dotted unless it becomes mandatory.
- Record verification commit SHA below after each update.

**Last verified against commit:** `9299fe34336cd1537942f90478cb2ba821709966`
