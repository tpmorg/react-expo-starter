import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useSyncTriggers } from '../SyncTriggers';
let mockOnline = true;
jest.mock('../../network/NetworkProvider', () => ({ useNetwork: () => ({ isConnected: mockOnline, isInternetReachable: mockOnline, connectionType: 'wifi' }) }));
test('triggers on owner, reconnect, active heartbeat, foreground and demand; cleans up timers', async () => {
  jest.useFakeTimers();
  const descriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  let onState!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  const subscription = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    onState = callback as (state: AppStateStatus) => void; return { remove };
  });
  const run = jest.fn(async (_owner: string) => {});
  let trigger!: () => Promise<void>;
  function Probe({ owner }: { owner: string }) { trigger = useSyncTriggers({ ownerId: owner, run, intervalMs: 100 }); return null; }
  let root!: ReactTestRenderer;
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await act(async () => { root = create(<Probe owner="a" />); });
    expect(run.mock.calls).toEqual([['a']]);
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(run).toHaveBeenCalledTimes(2);
    mockOnline = false;
    await act(async () => root.update(<Probe owner="a" />));
    await act(async () => { jest.advanceTimersByTime(100); });
    expect(run).toHaveBeenCalledTimes(2);
    mockOnline = true;
    await act(async () => root.update(<Probe owner="a" />));
    expect(run).toHaveBeenCalledTimes(3);
    await act(async () => root.update(<Probe owner="b" />));
    expect(run.mock.calls[3]).toEqual(['b']);
    await act(async () => { onState('active'); });
    await act(async () => { await trigger(); });
    expect(run).toHaveBeenCalledTimes(6);
    await act(async () => root.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    // React's renderer also owns timers; verify that our heartbeat stops doing work.
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(run).toHaveBeenCalledTimes(6);
  } finally {
    if (descriptor) Object.defineProperty(AppState, 'currentState', descriptor);
    subscription.mockRestore(); warn.mockRestore(); jest.useRealTimers(); mockOnline = true;
  }
});
