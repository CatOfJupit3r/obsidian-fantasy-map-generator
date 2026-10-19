import { Notice } from 'obsidian';

export function showNotice(message: string): Notice {
  return new Notice(message);
}
