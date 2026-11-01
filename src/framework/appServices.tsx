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
import { ApiClient } from './api/apiClient';
import { operationMigrations } from './storage/operationMigrations';
import { PendingOperationStore } from './operations/pendingOperationStore';

export interface FrameworkOptions {
  databaseName: string;
  namespace: string;
  authGateway?: AuthGateway;
  billingGateway?: BillingGateway;
  reporter?: ErrorReporter;
  migrations?: readonly DatabaseMigration[];
  jobsPath?: string;
  modules?: { operations?: boolean };
}

const defaultReporter: ErrorReporter = {
  captureException: (error) => console.error(error instanceof Error ? error.name : 'Application error'),
  addBreadcrumb: () => undefined,
  setUser: () => undefined
};

export function createAppServices(options: FrameworkOptions) {
  const config = getRuntimeConfig();
  const database = new AppDatabase([...coreMigrations, ...(options.modules?.operations ? operationMigrations : []), ...(options.migrations ?? [])], options.databaseName);
  const auth = new AuthStore(options.authGateway ?? new GuestAuthGateway());
  const reporter = options.reporter ?? defaultReporter;
  const billingCache = new BillingCacheRepository(database);
  const media = lazy(() => new MediaStore(uuidFactory));
  const jobs = lazy(() => new JobRepository(database, uuidFactory));
  const usage = lazy(() => new UsageRepository(database, uuidFactory));
  const generationApi = lazy(() => new GenerationApiClient(config.apiUrl, auth, options.jobsPath));
  const operations = lazy(() => options.modules?.operations ? new PendingOperationStore<unknown>(database, uuidFactory) : null);
  return {
    config, configIssues: validateRuntimeConfig(config), database, auth, reporter,
    network: new NetworkMonitor(),
    preferences: new KeyValueStore(options.namespace, reporter),
    get media() { return media(); },
    get jobs() { return jobs(); },
    get usage() { return usage(); },
    get operations() { return operations(); },
    api: new ApiClient(config.apiUrl, auth),
    billingCache,
    syncQueue: new SyncQueueRepository(database, uuidFactory),
    billingStore: options.billingGateway ? new BillingStore(options.billingGateway, billingCache, reporter) : null,
    get generationApi() { return generationApi(); }
  };
}
function lazy<T>(factory: () => T): () => T {
  let created = false; let value: T;
  return () => { if (!created) { value = factory(); created = true; } return value!; };
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
