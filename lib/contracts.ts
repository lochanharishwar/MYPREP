import { z } from 'zod';
export const platforms = [
  'instagram',
  'youtube',
  'x',
  'linkedin',
  'reddit',
] as const;
export type Platform = (typeof platforms)[number];
export type Role = 'owner' | 'editor' | 'approver' | 'viewer';
export const campaignSchema = z.object({
  brandId: z.uuid(),
  idea: z.string().min(8).max(6000),
  formats: z
    .array(z.enum(['text', 'image', 'video']))
    .min(1)
    .max(3),
  platforms: z.array(z.enum(platforms)).min(1),
  audience: z.string().max(1000).default(''),
  scenario: z.string().max(1000).default(''),
  event: z.string().max(500).default(''),
  direction: z.string().max(2000).default(''),
  budget: z.number().positive().max(100000),
});
export type CampaignBrief = z.infer<typeof campaignSchema>;
export interface Evidence {
  id: string;
  url: string;
  excerpt: string;
  observedAt: string;
  method:
    | 'dom'
    | 'computed-style'
    | 'metadata'
    | 'vision'
    | 'research'
    | 'user';
  confidence: number;
  selector?: string;
}
export interface Finding {
  text: string;
  type: 'fact' | 'interpretation' | 'research' | 'correction';
  evidenceIds: string[];
}
export interface BrandDNA {
  governance?: import('./brand-policy').BrandPolicy;
  schemaVersion: 1;
  version: number;
  brandId: string;
  name: string | null;
  tagline: string | null;
  logo: string | null;
  overview: Finding[];
  values: Finding[];
  aesthetics: Finding[];
  voice: Finding[];
  strengths: Finding[];
  weaknesses: Finding[];
  opportunities: Finding[];
  marketGaps: Finding[];
  competitors: Finding[];
  recommendations: Record<string, Finding[]>;
  fonts: string[];
  colors: {
    value: string;
    selector: string;
    url: string;
    method: string;
    count: number;
  }[];
  palette: string[];
  evidence: Evidence[];
  coverage: {
    discovered: number;
    completed: number;
    failed: number;
    excluded: number;
    status: 'complete' | 'partial';
  };
  createdAt: string;
}
export interface ReviewResult {
  transcript?: string;
  brandAlignment: number;
  psychology: number;
  visualQuality: number;
  platformFit: number;
  feedback: string[];
  score: number;
  passed: boolean;
  attempt: number;
}
export interface ContentVersion {
  sourceVersionId?: string;
  reviewFile?: { uri: string; name: string; state: string };
  provenance?: {
    generationModel: string;
    reviewModel: string;
    generationPrompt: string;
    reviewPrompt: string;
    rubric: string;
    policy: string;
    dnaVersion: number;
  };
  createdBy?: string;
  media?: import('./media-spec').MediaMetadata;
  campaignId: string;
  dnaId: string;
  format: 'text' | 'image' | 'video';
  platform: Platform;
  caption: string;
  assetPath: string | null;
  assetUrl?: string;
  mimeType: string | null;
  review: ReviewResult;
  status: 'draft' | 'reviewing' | 'qualified' | 'approved' | 'needs_revision';
  contentHash: string;
  attempt: number;
}
export interface Approval {
  contentId: string;
  contentHash: string;
  accountId: string;
  platform: Platform;
  approvedBy: string;
  approvedAt: string;
}
export interface ScheduledPost {
  verificationAttempts?: number;
  requiresOperator?: boolean;
  verificationCandidates?: { id: string; url: string }[];
  contentId: string;
  approvalId: string;
  accountId: string;
  platform: Platform;
  scheduledAt: string;
  timezone: string;
  status:
    | 'scheduled'
    | 'uploading'
    | 'publishing'
    | 'verifying'
    | 'published'
    | 'failed'
    | 'cancelled'
    | 'missed';
  revision: number;
  providerId?: string;
  url?: string;
  error?: string;
  upload?: Record<string, unknown>;
}
export interface MetricObservation {
  platform: Platform;
  postId: string;
  observedAt: string;
  metrics: Record<string, number | null>;
  definitions: Record<string, string>;
}
export const eventSchema = z
  .object({
    eventId: z.string().min(1).max(150),
    occurredAt: z.iso.datetime({ offset: true }),
    type: z.enum([
      'page_view',
      'engaged',
      'click',
      'video_progress',
      'purchase',
      'refund',
      'identify',
    ]),
    anonymousId: z.string().max(150).optional(),
    customerId: z.string().max(150).optional(),
    accountId: z.string().max(150).optional(),
    campaignId: z.uuid().optional(),
    channel: z.string().max(100).default('direct'),
    amount: z.number().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    orderId: z.string().max(150).optional(),
    properties: z.record(z.string(), z.unknown()).default({}),
  })
  .refine(
    (v) => v.type !== 'identify' || !!(v.anonymousId && v.customerId),
    'Identify requires both anonymous and customer IDs',
  )
  .refine(
    (v) => v.anonymousId || v.customerId,
    'An anonymous or customer identifier is required',
  )
  .refine(
    (v) =>
      !['purchase', 'refund'].includes(v.type) ||
      (v.amount !== undefined && !!v.currency && !!v.orderId),
    'Revenue events require amount, currency, and orderId',
  );
export type JourneyEvent = z.infer<typeof eventSchema>;
export interface Insight {
  what: string;
  why: string;
  recommendation: string;
  confidence: 'low' | 'medium' | 'high';
  evidenceIds: string[];
  metricIds: string[];
  createdAt: string;
}
export interface Entity<T = Record<string, unknown>> {
  id: string;
  workspace_id: string;
  brand_id: string | null;
  kind: string;
  payload: T;
  created_at: string;
  updated_at: string;
}
export interface Brand {
  id: string;
  workspace_id: string;
  name: string;
  website: string;
}
export interface WorkspaceState {
  configured: boolean;
  authenticated: boolean;
  user?: { id: string; email?: string };
  workspace?: {
    id: string;
    name: string;
    monthly_limit: number;
    currency: string;
    role: Role;
    publishing_paused?: boolean;
    require_mfa?: boolean;
    session_hours?: number;
    approval_policy?: {
      stages: string[];
      separationOfDuties: boolean;
      expiresHours: number;
    };
  };
  workspaces?: { id: string; name: string; role: Role }[];
  brands: Brand[];
  entities: Entity[];
  coverage?: { loaded: number; total: number };
  budget?: { reservedUSD: number; estimated: boolean; periodStart: string };
  services: { name: string; ready: boolean; detail: string }[];
  error?: string;
}
