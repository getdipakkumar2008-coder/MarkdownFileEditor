/**
 * Runs once at boot (see Architecture.md §2.1) — never branch on this
 * per-operation inside components.
 */
export function supportsNativeFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
