import type { SyncState } from '../../framework/contracts';
/** Optional example model for image-generation products; no core repository depends on it. */
export interface CreativeRecord {
  id: string; ownerId: string; sourceImageUri: string; generatedImageUri: string;
  localImagePath: string | null; title: string; body: string; metadataJson: string;
  createdAt: number; updatedAt: number; isFavorite: boolean; syncState: SyncState;
  remoteId: string | null; version: number;
}
