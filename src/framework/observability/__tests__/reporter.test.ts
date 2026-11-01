import * as Sentry from '@sentry/react-native';
import { configureSentry, SentryErrorReporter } from '../errorReporter';
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(), setUser: jest.fn(), reactNavigationIntegration: jest.fn(() => ({}))
}));
jest.mock('expo', () => ({ isRunningInExpoGo: () => true }));
test('Sentry identifies by id only and applies scrubbing to all outbound hooks', () => {
  new SentryErrorReporter().setUser({ id: 'uid', email: 'private@example.com', displayName: 'Private' });
  expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'uid' });
  expect(configureSentry(null)).toBe(false);
  expect(configureSentry('https://public@example.test/1', 'preview')).toBe(true);
  const options = (Sentry.init as jest.Mock).mock.calls[0]?.[0];
  expect(options).toMatchObject({ environment: 'preview', sendDefaultPii: false, enableNativeFramesTracking: false });
  for (const hook of ['beforeSend', 'beforeSendTransaction', 'beforeBreadcrumb']) {
    expect(options[hook]({ message: 'Bearer private', token: { value: 'private' } })).toEqual({ message: 'Bearer [redacted]', token: '[redacted]' });
  }
});
