import { selectMergeOutcome, shouldPreserveLocal } from '../mergePolicy';

describe('local-first merge policy', () => {
  it('preserves unsynced work even when the remote record is newer', () => {
    expect(shouldPreserveLocal(
      { updatedAt: 10, version: 1, syncState: 'pending_upload' },
      { updatedAt: 20, version: 2, syncState: 'synced' }
    )).toBe(true);
  });

  it('accepts a newer remote record when local state is safely synced', () => {
    expect(selectMergeOutcome(
      { updatedAt: 10, version: 1, syncState: 'synced' },
      { updatedAt: 20, version: 2, syncState: 'synced' }
    )).toBe('replace_local');
  });
});

