import React, { createContext, useContext, useMemo } from 'react';
import { GenerationApiClient } from './api/generationApiClient';
import { AuthStore, GuestAuthGateway } from './auth/authStore';
import { BillingStore } from './billing/billingStore';
import { getRuntimeConfig, validateRuntimeConfig } from './config/runtimeConfig';
import type { AuthGateway, BillingGateway, ErrorReporter } from './contracts';
import { uuidFactory } from './ids';
import { MediaStore } from './media/mediaStore';
import { NetworkMonitor } from './network/networkMonitor';
import { BillingCacheRepository } from './storage/billingCacheRepository';
import { coreMigrations } from './storage/coreMigrations';
import { AppDatabase, type DatabaseMigration } from './storage/database';
import { JobRepository } from './storage/jobRepository';
import { KeyValueStore } from './storage/keyValueStore';
import { SyncQueueRepository } from './storage/syncQueueRepository';
import { UsageRepository } from './storage/usageRepository';

export interface FrameworkOptions {
  databaseName: string;
  namespace: string;
  authGateway?: AuthGateway;
  billingGateway?: BillingGateway;
  reporter?: ErrorReporter;
  migrations?: readonly DatabaseMigration[];
  jobsPath?: string;
}

const defaultReporter: ErrorReporter = {
  captureException: (error) => console.error(error instanceof Error ? error.name : 'Application error'),
  addBreadcrumb: () => undefined,
  setUser: () => undefined
};

export function createAppServices(options: FrameworkOptions) {
  const config = getRuntimeConfig();
  const database = new AppDatabase([...coreMigrations, ...(options.migrations ?? [])], options.databaseName);
  const auth = new AuthStore(options.authGateway ?? new GuestAuthGateway());
  const reporter = options.reporter ?? defaultReporter;
  const billingCache = new BillingCacheRepository(database);
  return {
    config, configIssues: validateRuntimeConfig(config), database, auth, reporter,
    network: new NetworkMonitor(),
    preferences: new KeyValueStore(options.namespace),
    media: new MediaStore(uuidFactory),
    jobs: new JobRepository(database, uuidFactory),
    usage: new UsageRepository(database, uuidFactory),
    billingCache,
    syncQueue: new SyncQueueRepository(database, uuidFactory),
    billingStore: options.billingGateway ? new BillingStore(options.billingGateway, billingCache, reporter) : null,
    generationApi: new GenerationApiClient(config.apiUrl, auth, options.jobsPath)
  };
}
export type AppServices = ReturnType<typeof createAppServices>;
const Context = createContext<AppServices | null>(null);
export function AppServicesProvider({ children, options }: React.PropsWithChildren<{options: FrameworkOptions}>) {
  const services = useMemo(() => createAppServices(options), [options]);
  return <Context.Provider value={services}>{children}</Context.Provider>;
}
export function useAppServices(): AppServices {
  const value = useContext(Context);
  if (!value) throw new Error('Missing AppServicesProvider.');
  return value;
}
