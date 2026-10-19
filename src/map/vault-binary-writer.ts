import { TFile } from 'obsidian';
import type { Vault } from 'obsidian';

export type BinaryWriteVault = Pick<Vault, 'getAbstractFileByPath' | 'createBinary' | 'modifyBinary'>;

/** Writes a generated file over its previous version, or creates it. */
export class VaultBinaryWriter {
  public constructor(private readonly vault: BinaryWriteVault) {}

  public async write(path: string, data: ArrayBuffer) {
    const existing = this.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) await this.vault.modifyBinary(existing, data);
    else await this.vault.createBinary(path, data);
  }
}
