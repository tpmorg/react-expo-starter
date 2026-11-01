import React from 'react';
import { Text, Button } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { FrameworkProviders } from '../FrameworkProviders';
import { AppErrorBoundary } from '../errors/AppErrorBoundary';
import { useAppServices } from '../appServices';
import { AuthStore, GuestAuthGateway } from '../auth/authStore';
jest.mock('../appServices', () => ({ useAppServices: jest.fn() }));
const reporter = { captureException: jest.fn(), addBreadcrumb() {}, setUser() {} };
const network = { start() {}, stop() {}, getSnapshot: () => ({ isConnected: false, isInternetReachable: false, connectionType: 'none' }), subscribe: () => () => {} };

test('custom database error can retry and mount the product after storage recovers', async () => {
  const initialize = jest.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined);
  (useAppServices as jest.Mock).mockReturnValue({ database: { initialize }, reporter, auth: new AuthStore(new GuestAuthGateway()), network, configIssues: [], billingStore: null });
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
  let root!: ReactTestRenderer;
  try {
    await act(async () => { root = create(<FrameworkProviders renderDatabaseError={retry => <Button title="Custom retry" onPress={retry} />}><Text>Product</Text></FrameworkProviders>); });
    expect(root.root.findByType(Button).props.title).toBe('Custom retry');
    await act(async () => { root.root.findByType(Button).props.onPress(); });
    expect(JSON.stringify(root.toJSON())).toContain('Product'); expect(initialize).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); warn.mockRestore(); }
});
test('configuration and crash slots replace neutral fallbacks', async () => {
  (useAppServices as jest.Mock).mockReturnValue({ reporter, configIssues: [{ key: 'apiUrl', severity: 'error', message: 'invalid' }] });
  const warn = jest.spyOn(console, 'error').mockImplementation(() => {});
  let root!: ReactTestRenderer;
  const Broken = (): React.ReactNode => { throw new Error('failure'); };
  try {
    await act(async () => { root = create(<FrameworkProviders renderConfigError={issues => <Text>{`Config: ${issues[0]?.key}`}</Text>}><Text>Product</Text></FrameworkProviders>); });
    expect(JSON.stringify(root.toJSON())).toContain('Config: apiUrl');
    await act(async () => root.unmount());
    await act(async () => { root = create(<AppErrorBoundary reporter={reporter} renderCrash={() => <Text>Custom crash</Text>}><Broken /></AppErrorBoundary>); });
    expect(JSON.stringify(root.toJSON())).toContain('Custom crash');
  } finally { await act(async () => root.unmount()); warn.mockRestore(); }
});
