import { Notice } from 'obsidian';

/** Obsidian keeps a notice with this duration until it is clicked. */
export const PERSISTENT_NOTICE_DURATION_MS = 0;

export function showNotice(message: string, durationMs?: number): Notice {
  return new Notice(message, durationMs);
}
