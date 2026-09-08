import { z } from 'zod';
import { validatePlatformContent } from '@/lib/media-spec';
import { brandPolicySchema, checkBrandCopy } from '@/lib/brand-policy';
import { boundedBytes } from '@/lib/server/http';
import { createClient } from '@supabase/supabase-js';
import {
  db,
  scope,
  authenticate,
  entity,
  insertEntity,
  updateEntity,
  rpc,
} from '@/lib/server/db';
import { required } from '@/lib/server/env';
import { assertRole, contentHash, parseCSV, utcFromLocal } from '@/lib/domain';
import {
  campaignSchema,
  eventSchema,
  platforms,
  type ContentVersion,
  type ScheduledPost,
  type BrandDNA,
  type Entity,
} from '@/lib/contracts';
import { validatePublicUrl, encrypt } from '@/lib/server/security';
import { dispatch } from '@/lib/server/workflows';
import { reconcilePublication } from '@/lib/server/recovery';
import {
  authorizationUrl,
  capabilities,
  type Connection,
} from '@/lib/server/social';
export const dynamic = 'force-dynamic';
const uuid = z.uuid();
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    const { action } = await params;
    const raw = new TextDecoder().decode(await boundedBytes(request, 1500000));
    if (raw.length > 1500000)
      return Response.json({ error: 'Request is too large.' }, { status: 413 });
    const body = JSON.parse(raw);
    if (action === 'workspace') {
      const user = await authenticate(request);
      const client = createClient(
        required('SUPABASE_URL'),
        required('SUPABASE_ANON_KEY'),
        {
          global: {
            headers: { Authorization: request.headers.get('authorization')! },
          },
          auth: { persistSession: false },
        },
      );
      if (body.accept) {
        const { error } = await client.rpc('accept_invitations');
        if (error) throw error;
        return Response.json({ accepted: true });
      }
      const { name } = z
        .object({ name: z.string().min(2).max(100) })
        .parse(body);
      const { data, error } = await client.rpc('create_workspace', {
        p_name: name,
      });
      if (error) throw error;
      return Response.json({ id: data, userId: user.id });
    }
    const brandId = body.brandId ? uuid.parse(body.brandId) : undefined;
    const s = await scope(request, brandId);
    for (const key of ['id', 'contentId', 'approvalId', 'dnaId', 'accountId']) {
      if (
        typeof body[key] === 'string' &&
        z.uuid().safeParse(body[key]).success
      ) {
        const { data: reference } = await db()
          .from('entities')
          .select('brand_id')
          .eq('workspace_id', s.workspaceId)
          .eq('id', body[key])
          .maybeSingle();
        if (
          reference?.brand_id &&
          !(await rpc<boolean>('brand_access_for_user', {
            p_brand: reference.brand_id,
            p_user: s.user.id,
          }))
        )
          throw Object.assign(new Error('Brand access denied.'), {
            status: 403,
          });
      }
    }
    if (
      ['journey', 'evidence', 'delete-customer', 'imports', 'funnel'].includes(
        action,
      ) &&
      !s.customerAccess
    )
      throw Object.assign(new Error('Customer-data permission is required.'), {
        status: 403,
      });
    if (
      !(await rpc<boolean>('consume_ingest_limit', {
        p_key: `action:${s.workspaceId}:${s.user.id}`,
        p_max: 60,
      }))
    )
      return Response.json(
        { error: 'Too many workspace requests. Retry in one minute.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    const editor = () => assertRole(s.role, ['owner', 'editor']);
    const approver = () => assertRole(s.role, ['owner', 'approver']);
    const owner = () => assertRole(s.role, ['owner']);
    const commandId = uuid.parse(
      request.headers.get('Idempotency-Key') ?? crypto.randomUUID(),
    );
    const runCommand = <T>(name: string, args: Record<string, unknown>) =>
      rpc<T>('business_command', {
        p_workspace: s.workspaceId,
        p_actor: s.user.id,
        p_key: commandId,
        p_action: name,
        p_request: body,
        p_args: args,
      });
    const createJob = <T>(
      brand: string,
      kind: string,
      payload: T,
      name = kind,
    ) => runCommand<Entity<T>>(name, { brandId: brand, kind, payload });
    if (action === 'evidence') {
      if (!brandId) throw new Error('Select a brand.');
      const ids = z.array(uuid).max(100).parse(body.ids);
      const { data, error } = await db()
        .from('feedback')
        .select('id,body,url,created_at')
        .eq('brand_id', brandId)
        .in('id', ids);
      if (error) throw error;
      return Response.json({ sources: data });
    }
    if (action === 'journey') {
      if (!brandId) throw new Error('Select a brand.');
      const customer = z.string().min(1).max(150).parse(body.customerId);
      return Response.json({
        events: await rpc('journey_details', {
          p_brand: brandId,
          p_customer: customer,
          p_offset: z
            .number()
            .int()
            .nonnegative()
            .default(0)
            .parse(body.offset),
        }),
      });
    }
    if (action === 'funnel') {
      if (!brandId) throw new Error('Select a brand.');
      return Response.json(await rpc('journey_funnel', { p_brand: brandId }));
    }
    if (action === 'brands') {
      editor();
      const url = await validatePublicUrl(z.url().parse(body.url));
      const { data, error } = await db()
        .from('brands')
        .insert({
          workspace_id: s.workspaceId,
          website: url,
          name: new URL(url).hostname,
        })
        .select()
        .single();
      if (error) throw error;
      return Response.json(data);
    }
    if (action === 'settings') {
      owner();
      const input = z
        .object({
          monthlyLimit: z.number().nonnegative().max(1000000),
          name: z.string().min(2).max(100),
        })
        .parse(body);
      const { error } = await db()
        .from('workspaces')
        .update({ monthly_limit: input.monthlyLimit, name: input.name })
        .eq('id', s.workspaceId);
      if (error) throw error;
      return Response.json({ saved: true });
    }
    if (action === 'team') {
      owner();
      const input = z
        .object({
          email: z.email(),
          role: z.enum(['editor', 'approver', 'viewer']),
        })
        .parse(body);
      const { error } = await db().from('invitations').upsert(
        {
          workspace_id: s.workspaceId,
          email: input.email.toLowerCase(),
          role: input.role,
        },
        { onConflict: 'workspace_id,email' },
      );
      if (error) throw error;
      return Response.json({
        saved: true,
        message:
          'Invitation recorded. Your teammate can sign in and accept workspace invitations.',
      });
    }
    if (action === 'scan') {
      editor();
      if (!brandId) throw new Error('Select a brand.');
      required('FIRECRAWL_API_KEY');
      required('GEMINI_API_KEY');
      required('BROWSERLESS_API_KEY');
      required('COST_MAP');
      const { data: b, error } = await db()
        .from('brands')
        .select('website')
        .eq('id', brandId)
        .single();
      if (error) throw error;
      const scan = await createJob(brandId, 'scan', {
        url: b.website,
        status: 'queued',
        queue: [],
        completed: [],
        failed: [],
        excluded: [],
        batch: 0,
        discovered: 0,
        agent: 1,
      });
      await dispatch('brand/scan', { scanId: scan.id }, scan.id);
      return Response.json({ jobId: scan.id }, { status: 202 });
    }
    if (action === 'resume-scan') {
      editor();
      const scan = await entity<Record<string, unknown>>(
        uuid.parse(body.id),
        s.workspaceId,
        'scan',
      );
      if (!['partial', 'blocked'].includes(String(scan.payload.status)))
        throw new Error('This scan is not paused.');
      const failed = scan.payload.failed as string[];
      await updateEntity(scan.id, {
        ...scan.payload,
        status: 'queued',
        failed: [],
        queue: [...((scan.payload.queue as string[]) ?? []), ...(failed ?? [])],
        batch: Number(scan.payload.batch) + 1,
      });
      await dispatch('brand/scan', { scanId: scan.id });
      return Response.json({ jobId: scan.id }, { status: 202 });
    }
    if (action === 'dna') {
      editor();
      const old = await entity<BrandDNA>(
        uuid.parse(body.id),
        s.workspaceId,
        'dna',
      );
      const correction = z
        .object({
          name: z.string().max(200).nullable(),
          tagline: z.string().max(1000).nullable(),
        })
        .parse(body.correction);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const next = {
        ...old.payload,
        governance: old.payload.governance
          ? {
              ...old.payload.governance,
              approvedBy: undefined,
              approvedAt: undefined,
            }
          : undefined,
        ...correction,
        version: Date.now(),
        createdAt: now,
        evidence: [
          ...old.payload.evidence,
          {
            id,
            url: 'user:correction',
            excerpt: JSON.stringify(correction),
            observedAt: now,
            method: 'user' as const,
            confidence: 1,
          },
        ],
        overview: [
          ...old.payload.overview,
          {
            text: 'Name and tagline corrected by a workspace editor.',
            type: 'correction' as const,
            evidenceIds: [id],
          },
        ],
      };
      return Response.json(
        await insertEntity(s.workspaceId, old.brand_id, 'dna', next),
      );
    }
    if (action === 'brand-policy') {
      owner();
      const old = await entity<BrandDNA>(
        uuid.parse(body.id),
        s.workspaceId,
        'dna',
      );
      const policy = brandPolicySchema.parse(body.policy);
      for (const id of policy.assetIds) {
        const asset = await entity(id, s.workspaceId, 'brand_asset');
        if (asset.brand_id !== old.brand_id)
          throw new Error('Pinned assets must belong to this brand.');
      }
      const ids = new Set(old.payload.evidence.map((e) => e.id));
      if (
        policy.approvedClaims.some((c) =>
          c.evidenceIds.some((id) => !ids.has(id)),
        )
      )
        throw new Error(
          'Every approved claim must cite evidence in this Brand DNA version.',
        );
      const now = new Date().toISOString();
      return Response.json(
        await insertEntity(s.workspaceId, old.brand_id, 'dna', {
          ...old.payload,
          version: Date.now(),
          createdAt: now,
          governance: {
            ...policy,
            version: Date.now(),
            approvedBy: s.user.id,
            approvedAt: now,
          },
        }),
      );
    }
    if (action === 'campaign') {
      editor();
      const input = campaignSchema.parse(body);
      await scope(request, input.brandId);
      for (const format of input.formats)
        if (
          !input.platforms.some((p) => capabilities[p].formats.includes(format))
        )
          throw new Error(
            `${format} is unsupported by the selected platforms.`,
          );
      required('GEMINI_API_KEY');
      required('COST_TEXT');
      if (input.formats.some((f) => f !== 'text')) {
        required('PROCESSOR_URL');
        required('PROCESSOR_SECRET');
      }
      const { data: dna } = await db()
        .from('entities')
        .select('*')
        .eq('brand_id', input.brandId)
        .eq('kind', 'dna')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!dna)
        throw new Error('Analyze your website before generating content.');
      if (!dna.payload.governance?.approvedBy)
        throw new Error(
          'Ask an owner to approve the Brand DNA governance policy before generation.',
        );
      if (
        dna.payload.governance.rightsExpireAt &&
        Date.parse(dna.payload.governance.rightsExpireAt) <= Date.now()
      )
        throw new Error('Brand usage rights expired.');
      const campaign = await createJob(input.brandId, 'campaign', {
        ...input,
        dnaId: dna.id,
        status: 'queued',
      });
      await dispatch(
        'campaign/generate',
        { campaignId: campaign.id },
        campaign.id,
      );
      return Response.json({ jobId: campaign.id }, { status: 202 });
    }
    if (action === 'decision') {
      const id = uuid.parse(body.id);
      const content = await entity<ContentVersion>(
        id,
        s.workspaceId,
        'content',
      );
      if (body.decision === 'approve') {
        validatePlatformContent(content.payload);
        const dna = await entity<BrandDNA>(
          content.payload.dnaId,
          s.workspaceId,
          'dna',
        );
        checkBrandCopy(content.payload.caption, dna.payload.governance);
        approver();
        const hash = await contentHash(content.payload);
        const decision = await rpc<{ id?: string; status: string }>(
          'decide_approval',
          {
            p_workspace: s.workspaceId,
            p_content: id,
            p_account: uuid.parse(body.accountId),
            p_user: s.user.id,
            p_hash: hash,
            p_stage: z
              .enum(['creative', 'brand', 'legal'])
              .default('brand')
              .parse(body.stage),
          },
        );
        return Response.json({
          approvalId: decision.id,
          status: decision.status,
        });
      }
      editor();
      if (body.decision === 'edit') {
        const caption = z.string().min(1).max(40000).parse(body.caption);
        if (caption === content.payload.caption)
          throw new Error('Change the caption before creating a revision.');
        const draft = await createJob(
          content.brand_id!,
          'content',
          {
            ...content.payload,
            caption,
            sourceVersionId: content.id,
            contentHash: '',
            status: 'reviewing',
            review: { ...content.payload.review, passed: false, score: 0 },
            createdBy: s.user.id,
          },
          'draft',
        );
        await dispatch(
          'content/review',
          { contentId: draft.id },
          'review-' + draft.id,
        );
        return Response.json({ jobId: draft.id }, { status: 202 });
      }
      if (body.decision === 'reject') {
        const path = await rpc<string | null>('reject_content', {
          p_workspace: s.workspaceId,
          p_id: id,
        });
        if (path) {
          const { error } = await db().storage.from('media').remove([path]);
          if (error) {
            await insertEntity(
              s.workspaceId,
              content.brand_id,
              'asset_deletion',
              { path, status: 'pending' },
            );
            throw new Error(
              'Content rejected; asset deletion queued for retry.',
            );
          }
        }
        return Response.json({ deleted: true });
      }
      if (body.decision === 'redo') {
        const original = await entity<Record<string, unknown>>(
          content.payload.campaignId,
          s.workspaceId,
          'campaign',
        );
        const campaign = await createJob(
          content.brand_id!,
          'campaign',
          {
            ...original.payload,
            budgetCampaignId: original.payload.budgetCampaignId ?? original.id,
            formats: [content.payload.format],
            platforms: [content.payload.platform],
            direction:
              (typeof original.payload.direction === 'string'
                ? original.payload.direction
                : '') +
              '\nRevision request: ' +
              z
                .string()
                .max(2000)
                .parse(body.feedback ?? ''),
            status: 'queued',
          },
          'redo',
        );
        await dispatch(
          'campaign/generate',
          { campaignId: campaign.id },
          campaign.id,
        );
        return Response.json({ jobId: campaign.id }, { status: 202 });
      }
      throw new Error('Unknown decision.');
    }
    if (action === 'schedule') {
      approver();
      const at = utcFromLocal(
        z.string().parse(body.localTime),
        z.string().parse(body.timezone),
      );
      const approval = await entity<{ contentId: string }>(
        uuid.parse(body.approvalId),
        s.workspaceId,
        'approval',
      );
      const content = await entity<ContentVersion>(
        approval.payload.contentId,
        s.workspaceId,
        'content',
      );
      validatePlatformContent(content.payload);
      const { id } = await runCommand<{ id: string }>('schedule', {
        id: approval.id,
        at,
        timezone: body.timezone,
      });
      await dispatch(
        'post/schedule',
        { scheduleId: id, revision: 1 },
        `${id}-1`,
      );
      return Response.json({ id }, { status: 202 });
    }
    if (action === 'reconcile') {
      approver();
      const record = await entity(
        uuid.parse(body.id),
        s.workspaceId,
        'schedule',
      );
      const resolution = body.providerId
        ? {
            providerId: z.string().min(1).max(200).parse(body.providerId),
            actorId: s.user.id,
            reason: z.string().min(10).max(1000).parse(body.reason),
          }
        : undefined;
      const result = await reconcilePublication(record.id, resolution, true);
      if (result.status === 'published')
        await dispatch('post/feedback', { scheduleId: record.id });
      return Response.json(result);
    }
    if (action === 'change-schedule') {
      approver();
      const id = uuid.parse(body.id);
      const command = z.enum(['cancel', 'reschedule']).parse(body.command);
      const at =
        command === 'reschedule'
          ? utcFromLocal(body.localTime, body.timezone)
          : null;
      const result = await runCommand<ScheduledPost>('change-schedule', {
        id,
        command,
        at,
        timezone: body.timezone ?? null,
      });
      if (command === 'reschedule')
        await dispatch(
          'post/schedule',
          { scheduleId: id, revision: result.revision },
          `${id}-${result.revision}`,
        );
      return Response.json(result);
    }
    if (action === 'connect') {
      owner();
      if (!brandId) throw new Error('Select a brand.');
      const platform = z.enum(platforms).parse(body.platform);
      const verifier = Buffer.from(
        crypto.getRandomValues(new Uint8Array(40)),
      ).toString('base64url');
      const state = await insertEntity(s.workspaceId, brandId, 'oauth_state', {
        platform,
        userId: s.user.id,
        expiresAt: Date.now() + 600000,
        verifier: await encrypt(verifier),
      });
      return Response.json({
        url: await authorizationUrl(platform, state.id, verifier),
      });
    }
    if (action === 'connection') {
      owner();
      const record = await entity<Connection>(
        uuid.parse(body.id),
        s.workspaceId,
        'connection',
      );
      if (body.disconnect) {
        await db().from('credentials').delete().eq('entity_id', record.id);
        await updateEntity(record.id, { ...record.payload, status: 'expired' });
        return Response.json({ disconnected: true });
      }
      const destination = z.string().max(150).parse(body.destination);
      if (
        record.payload.platform === 'reddit' &&
        !/^\w{2,30}$/.test(destination)
      )
        throw new Error('Enter a subreddit name without r/.');
      if (
        record.payload.platform === 'linkedin' &&
        !/^urn:li:(organization|person):[\w-]+$/.test(destination)
      )
        throw new Error('Enter a LinkedIn author URN.');
      await rpc('connection_destination', {
        p_workspace: s.workspaceId,
        p_id: record.id,
        p_destination: destination,
      });
      return Response.json({ saved: true });
    }
    if (action === 'tracking') {
      owner();
      if (!brandId) throw new Error('Select a brand.');
      const secret = Buffer.from(
        crypto.getRandomValues(new Uint8Array(32)),
      ).toString('hex');
      const record = await insertEntity(
        s.workspaceId,
        brandId,
        'tracking_secret',
        { enabled: true },
      );
      const { error } = await db()
        .from('credentials')
        .insert({ entity_id: record.id, encrypted: await encrypt(secret) });
      if (error) throw error;
      return Response.json({
        trackingId: record.id,
        webhookSecret: secret,
        script: `<script async src="${required('APP_ORIGIN')}/tracker.js" data-key="${record.id}"></script>`,
        endpoint: `${required('APP_ORIGIN')}/api/collect`,
      });
    }
    if (action === 'imports') {
      editor();
      if (!brandId) throw new Error('Select a brand.');
      const input = z
        .object({
          kind: z.enum([
            'events',
            'customers',
            'accounts',
            'spend',
            'feedback',
          ]),
          csv: z.string().min(1).max(1000000),
        })
        .parse(body);
      const rows = parseCSV(input.csv);
      if (rows.length > 500)
        throw new Error('Import at most 500 rows per batch.');
      if (input.kind === 'events') {
        const events = rows.map((r) =>
          eventSchema.parse({
            ...r,
            anonymousId: r.anonymousId || undefined,
            customerId: r.customerId || undefined,
            campaignId: r.campaignId || undefined,
            amount: r.amount ? Number(r.amount) : undefined,
            currency: r.currency || undefined,
            orderId: r.orderId || undefined,
            properties: r.properties ? JSON.parse(r.properties) : {},
          }),
        );
        const mapped = events.map((e) => ({
          workspace_id: s.workspaceId,
          brand_id: brandId,
          event_id: e.eventId,
          occurred_at: e.occurredAt,
          type: e.type,
          anonymous_id: e.anonymousId,
          customer_id: e.customerId,
          account_id: e.accountId,
          campaign_id: e.campaignId,
          channel: e.channel,
          amount: e.amount,
          currency: e.currency,
          order_id: e.orderId,
          source: 'import',
          properties: e.properties,
        }));
        const { error } = await db().from('journey_events').upsert(mapped, {
          onConflict: 'brand_id,event_id',
          ignoreDuplicates: true,
        });
        if (error) throw error;
      } else if (input.kind === 'feedback') {
        const parsed = rows.map((r) =>
          z
            .object({
              sourceId: z.string().min(1),
              body: z.string().min(1).max(16000),
              url: z.string().optional(),
              customerId: z.string().optional(),
            })
            .parse(r),
        );
        const { error } = await db()
          .from('feedback')
          .upsert(
            parsed.map((r) => ({
              workspace_id: s.workspaceId,
              brand_id: brandId,
              source_id: r.sourceId,
              body: r.body,
              url: r.url,
              customer_id: r.customerId || null,
            })),
            { onConflict: 'brand_id,source_id', ignoreDuplicates: true },
          );
        if (error) throw error;
      } else {
        const schemas = {
          customers: z.object({
            customerId: z.string().min(1),
            name: z.string(),
            email: z.email().or(z.literal('')).optional(),
            accountId: z.string().optional(),
          }),
          accounts: z.object({
            accountId: z.string().min(1),
            name: z.string().min(1),
          }),
          spend: z.object({
            spendId: z.string().min(1),
            date: z.iso.date(),
            channel: z.string().min(1),
            amount: z.coerce.number().nonnegative(),
            currency: z.string().regex(/^[A-Z]{3}$/),
            category: z.enum(['advertising', 'acquisition']),
          }),
        };
        const parsed = rows.map((r) =>
          schemas[input.kind as 'customers' | 'accounts' | 'spend'].parse(r),
        );
        await rpc('import_entities', {
          p_workspace: s.workspaceId,
          p_brand: brandId,
          p_kind: input.kind,
          p_rows: parsed,
        });
      }
      const refreshQueued = await dispatch('brand/insights', {
        workspaceId: s.workspaceId,
        brandId,
      })
        .then(() => true)
        .catch(() => false);
      return Response.json({ imported: rows.length, refreshQueued });
    }
    if (action === 'refresh-insights') {
      editor();
      if (!brandId) throw new Error('Select a brand.');
      await dispatch('brand/insights', { workspaceId: s.workspaceId, brandId });
      return Response.json({ queued: true }, { status: 202 });
    }
    if (action === 'delete-customer') {
      owner();
      if (!brandId) throw new Error('Select a brand.');
      const customer = z.string().min(1).max(150).parse(body.customerId);
      const { error } = await db().rpc('delete_customer', {
        p_workspace: s.workspaceId,
        p_brand: brandId,
        p_customer: customer,
      });
      if (error) throw error;
      await dispatch('brand/insights', {
        workspaceId: s.workspaceId,
        brandId,
      }).catch(() => {});
      return Response.json({ deleted: true });
    }
    return Response.json({ error: 'Unknown action.' }, { status: 404 });
  } catch (e) {
    const error = e as Error & { status?: number };
    const status = e instanceof z.ZodError ? 400 : (error.status ?? 400);
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues
                .map((i) => `${i.path.join('.')}: ${i.message}`)
                .join('; ')
            : error.message || 'Request failed.',
      },
      { status },
    );
  }
}
