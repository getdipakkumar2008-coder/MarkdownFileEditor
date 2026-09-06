import { InjectionToken } from '@angular/core';

/**
 * Metadata passed to report() must never include file content, full file
 * paths, or folder names — basenames/error codes only (CLAUDE.md rule 1,
 * Architecture.md §2.4).
 */
export interface ErrorMetadata {
  code: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ErrorReporter {
  report(error: unknown, metadata: ErrorMetadata): void;
}

export const ERROR_REPORTER = new InjectionToken<ErrorReporter>('ERROR_REPORTER');

const DENYLISTED_KEYS = new Set(['path', 'filePath', 'folderPath', 'content', 'fileName', 'folderName']);
/** Heuristic: a real file/folder path is very unlikely to be this short and this free of separators. */
const MAX_SAFE_VALUE_LENGTH = 100;

/**
 * Best-effort runtime backstop for the "never log file content or paths"
 * rule (CLAUDE.md rule 1) — every ErrorReporter implementation runs
 * metadata through this before it leaves the app, rather than trusting
 * every call site to remember on its own.
 */
export function redactUnsafeMetadata(metadata: ErrorMetadata): ErrorMetadata {
  const safe: ErrorMetadata = { code: metadata.code };
  for (const [key, value] of Object.entries(metadata)) {
    if (key === 'code') continue;
    if (DENYLISTED_KEYS.has(key)) continue;
    if (typeof value === 'string' && (value.includes('/') || value.includes('\\') || value.length > MAX_SAFE_VALUE_LENGTH)) {
      continue; // looks path-like or too long to plausibly be a safe label — drop it
    }
    safe[key] = value;
  }
  return safe;
}
