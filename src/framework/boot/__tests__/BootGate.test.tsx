import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { BootGate, useBootStep } from '../BootGate';
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() }));
test('named steps keep content mounted; timeout exposes the underlying error screen', async () => {
  jest.useFakeTimers();
  const hide = jest.fn(async () => {});
  let root!: ReactTestRenderer;
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
  function Step() { useBootStep('fonts', true); return null; }
  try {
    await act(async () => { root = create(<BootGate steps={['fonts', 'content']} splash={{ hide }} timeoutMs={10} renderOverlay={() => <Step />}><Step /></BootGate>); });
    expect(hide).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(10); });
    expect(hide).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); warn.mockRestore(); jest.useRealTimers(); }
});
