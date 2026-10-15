export type SyncState =
  | 'local_only'
  | 'pending_upload'
  | 'synced'
  | 'pending_delete'
  | 'conflict'
  | 'failed';

export interface SessionUser {
  id: string;
  email?: string;
  displayName?: string;
}

export interface AuthTokenProvider {
  getToken(forceRefresh?: boolean): Promise<string | null>;
}

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: SessionUser };

export interface AuthGateway extends AuthTokenProvider {
  getCurrentUser(): SessionUser | null;
  subscribe(listener: (user: SessionUser | null) => void): () => void;
  signOut(): Promise<void>;
}

export interface BillingProduct {
  id: string;
  packageId: string;
  title: string;
  description: string;
  priceLabel: string;
  kind: 'subscription' | 'credit_pack';
}

export interface BillingState {
  isConfigured: boolean;
  isVerified: boolean;
  hasEntitlement: boolean;
  entitlementId: string;
  creditBalance: number;
  activeProductIds: string[];
  purchasedProductIds: string[];
  checkedAt: number;
}

export interface PurchaseResult {
  status: 'purchased' | 'cancelled' | 'failed';
  state: BillingState;
  message?: string;
}

export interface BillingGateway {
  configure(userId: string): Promise<boolean>;
  identify(userId: string): Promise<void>;
  getState(refresh?: boolean): Promise<BillingState>;
  getProducts(): Promise<BillingProduct[]>;
  purchase(product: BillingProduct): Promise<PurchaseResult>;
  restore(): Promise<BillingState>;
  logOut(): Promise<void>;
}

export interface GenerationJob<TResult> {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  pollAfterMs?: number;
  result?: TResult;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
    requestId?: string;
  };
}

export type PersistedJobStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface PersistedGenerationJob<TRequest = unknown, TResult = unknown> {
  id: string;
  ownerId: string;
  idempotencyKey: string;
  operation: string;
  status: PersistedJobStatus;
  request: TRequest;
  result: TResult | null;
  error: GenerationJob<unknown>['error'] | null;
  remoteJobId: string | null;
  attempts: number;
  nextPollAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UsageEvent {
  id: string;
  ownerId: string;
  jobId: string | null;
  eventType: 'admitted' | 'completed' | 'failed' | 'refunded';
  source: 'free' | 'subscription' | 'credits' | 'system';
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface SyncQueueEntry<TPayload = unknown> {
  id: string;
  ownerId: string;
  entityType: string;
  entityId: string;
  operation: 'upsert' | 'delete';
  payload: TPayload | null;
  attempts: number;
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface NetworkState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  connectionType: string;
}

export interface ErrorReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void;
  addBreadcrumb(message: string, data?: Record<string, unknown>): void;
  setUser(user: SessionUser | null): void;
}

export interface CreativeRecord {
  id: string;
  ownerId: string;
  sourceImageUri: string;
  generatedImageUri: string;
  localImagePath: string | null;
  title: string;
  body: string;
  metadataJson: string;
  createdAt: number;
  updatedAt: number;
  isFavorite: boolean;
  syncState: SyncState;
  remoteId: string | null;
  version: number;
}
