export type ApiAccessTier = "admin" | "granted" | "paid";

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

export interface Env {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_URL?: string;
  /** Full Firebase Service Account JSON (set via `wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON`). */
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  /** Alternative split secrets when not using FIREBASE_SERVICE_ACCOUNT_JSON. */
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  /** Comma-separated Firebase UIDs that always have admin + free unlimited API access. */
  ADMIN_UIDS?: string;
  /** Comma-separated allowed browser origins for Firebase-ID-token UI calls. */
  ALLOWED_ORIGINS?: string;
  /** Set to "true" in local `.dev.vars` to allow localhost/127.0.0.1 browser origins. */
  ALLOW_DEV_ORIGINS?: string;
  /** Maximum non-revoked API keys per user account (default: 10). */
  MAX_KEYS_PER_USER?: string;
  /** Optional Cloudflare Workers Rate Limiting binding. */
  RATE_LIMITER?: RateLimiterBinding;
}

export interface ApiEntitlement {
  uid: string;
  enabled: boolean;
  tier: ApiAccessTier;
  grantedAt: string;
  grantedBy: string;
  updatedAt: string;
  note?: string;
}

export interface UserApiKeyMetadata {
  keyId: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface ApiKeyHashRecord {
  uid: string;
  keyId: string;
  prefix: string;
  createdAt: string;
  revokedAt?: string;
}

export interface PublicProfile {
  uid: string;
  username: string;
  displayUsername?: string;
  displayName: string;
  photoURL?: string;
  updatedAt?: string;
}

export interface StoredUserProfile {
  uid: string;
  username: string;
  displayUsername?: string;
  displayName?: string;
  photoURL?: string;
  githubUsername?: string;
}

export type RoomMemberRole = "owner" | "editor" | "viewer";

export interface RoomMetadata {
  roomId: string;
  title: string;
  ownerUid: string;
  ownerUsername: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  contentHash: string;
  taskCount?: number;
  noteCount?: number;
  theme?: string;
  allowViewerForks?: boolean;
  secretKey?: unknown;
}

export interface RoomMember {
  uid: string;
  username: string;
  displayName: string;
  photoURL?: string;
  role: RoomMemberRole;
  joinedAt: string;
  teamId?: string;
  teamName?: string;
}

export interface RoomTeam {
  id: string;
  name: string;
  color?: string;
  memberUids: string[];
  memberUsernames: string[];
  role: "editor" | "viewer";
  addedAt: string;
}

export interface UserRoomPointer {
  roomId: string;
  title: string;
  ownerUid: string;
  ownerUsername: string;
  role: RoomMemberRole;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  noteCount?: number;
}

export interface AccessState {
  uid: string;
  enabled: boolean;
  tier: ApiAccessTier | null;
  isAdmin: boolean;
  isConfigAdmin: boolean;
  entitlement: ApiEntitlement | null;
}

export interface AuthenticatedApiAccount extends AccessState {
  keyId: string;
  keyHash: string;
}

export interface AdminUserAccessSummary {
  uid: string;
  username: string;
  displayUsername?: string;
  displayName: string;
  photoURL?: string;
  entitlement: ApiEntitlement | null;
  isConfigAdmin: boolean;
  activeKeyCount: number;
  lastKeyUsedAt?: string;
}

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface VerifiedFirebaseToken {
  uid: string;
  provider: string;
  email?: string;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

