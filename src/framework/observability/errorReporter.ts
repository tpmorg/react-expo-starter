import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import { scrub, scrubDeep } from './scrub';

import type { ErrorReporter, SessionUser } from '../contracts';

export class ConsoleErrorReporter implements ErrorReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void {
    console.error(scrubDeep(error), scrubDeep(context));
  }

  addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    if (__DEV__) console.info(scrub(message), scrubDeep(data));
  }

  setUser(): void {}
}

export class SentryErrorReporter implements ErrorReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void {
    Sentry.withScope((scope) => {
      if (context) scope.setContext('operation', context);
      Sentry.captureException(error);
    });
  }

  addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    Sentry.addBreadcrumb({ category: 'app', message, data });
  }

  setUser(user: SessionUser | null): void {
    Sentry.setUser(user ? { id: user.id } : null);
  }
}

export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
  ignoreEmptyBackNavigationTransactions: true
});

export function configureSentry(dsn: string | null, environment = __DEV__ ? 'development' : 'production'): boolean {
  if (!dsn || !/^https:\/\/.+@.+\/.+/.test(dsn)) return false;
  Sentry.init({
    dsn, environment, sendDefaultPii: false,
    enableAutoSessionTracking: true, enableNativeFramesTracking: !isRunningInExpoGo(),
    tracesSampleRate: __DEV__ ? 1 : 0.2,
    integrations: [navigationIntegration],
    beforeSend: event => scrubDeep(event),
    beforeSendTransaction: event => scrubDeep(event),
    beforeBreadcrumb: breadcrumb => scrubDeep(breadcrumb)
  });
  return true;
}

