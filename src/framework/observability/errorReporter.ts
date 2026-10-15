import * as Sentry from '@sentry/react-native';

import type { ErrorReporter, SessionUser } from '../contracts';

export class ConsoleErrorReporter implements ErrorReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void {
    console.error(error, context);
  }

  addBreadcrumb(message: string, data?: Record<string, unknown>): void {
    if (__DEV__) console.info(message, data);
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
    Sentry.setUser(user ? { id: user.id, email: user.email, username: user.displayName } : null);
  }
}

export function configureSentry(dsn: string | null): boolean {
  if (!dsn || !/^https:\/\/.+@.+\/.+/.test(dsn)) return false;
  Sentry.init({ dsn, enableAutoSessionTracking: true, debug: __DEV__ });
  return true;
}

