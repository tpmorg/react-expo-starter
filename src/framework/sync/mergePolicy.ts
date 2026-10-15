import type { SyncState } from '../contracts';

export interface MergeCandidate {
  updatedAt: number;
  deletedAt?: number | null;
  syncState: SyncState;
  version: number;
}

export function shouldPreserveLocal(local: MergeCandidate, remote: MergeCandidate): boolean {
  if (local.syncState === 'local_only') return true;
  if (local.syncState === 'pending_upload' || local.syncState === 'pending_delete') return true;
  if (local.syncState === 'conflict' || local.syncState === 'failed') return true;
  if (local.version > remote.version) return true;
  return local.updatedAt > remote.updatedAt;
}

export function selectMergeOutcome(
  local: MergeCandidate | null,
  remote: MergeCandidate
): 'insert_remote' | 'replace_local' | 'preserve_local' | 'record_conflict' {
  if (!local) return 'insert_remote';
  if (shouldPreserveLocal(local, remote)) {
    return local.updatedAt === remote.updatedAt && local.version === remote.version
      ? 'record_conflict'
      : 'preserve_local';
  }
  return 'replace_local';
}
