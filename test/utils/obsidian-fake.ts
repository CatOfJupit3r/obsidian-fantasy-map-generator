/**
 * Runtime stand-in for the `obsidian` module, which ships types only. Vitest aliases `obsidian` to this file; it holds
 * just the values the tested modules import. Tests build files through `FakeVault`.
 */
export class TAbstractFile {
  public path = '';

  public name = '';
}

export class TFile extends TAbstractFile {
  public basename = '';

  public extension = '';
}

export class TFolder extends TAbstractFile {}

export function normalizePath(path: string): string {
  const normalized = path
    .replaceAll('\\', '/')
    .replace(/\/+/gu, '/')
    .replace(/^\/|\/$/gu, '');
  return normalized === '' ? '/' : normalized;
}
