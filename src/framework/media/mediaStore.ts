import * as FileSystem from 'expo-file-system/legacy';

import type { IdFactory } from '../ids';

export type MediaRole = 'source' | 'result' | 'guidance';

export class MediaStore {
  private readonly root: string;

  constructor(private readonly ids: IdFactory, rootDirectory?: string) {
    const documents = rootDirectory ?? FileSystem.documentDirectory;
    if (!documents) throw new Error('App document directory is unavailable.');
    this.root = `${documents.replace(/\/$/, '')}/media`;
  }

  async persist(sourceUri: string, role: MediaRole, extension = 'jpg'): Promise<string> {
    const normalizedExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const directory = `${this.root}/${role}`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const destination = `${directory}/${this.ids.create()}.${normalizedExtension}`;
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    return destination;
  }

  async remove(uri: string): Promise<void> {
    if (!this.owns(uri)) throw new Error('Refusing to remove media outside the app media directory.');
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  owns(uri: string): boolean {
    try {
      const candidate = decodeURIComponent(uri);
      return candidate.startsWith(`${this.root}/`) &&
        !candidate.split('/').some((segment) => segment === '..' || segment === '.') &&
        !candidate.includes('\\\\');
    } catch { return false; }
  }
}
