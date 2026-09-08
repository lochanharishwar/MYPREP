import 'server-only';
import { required } from './env';
import { rpc, entity } from './db';
export interface BillingContext {
  workspaceId: string;
  brandId: string;
  campaignId?: string;
}
export async function reserve(ctx: BillingContext, tariff: string, units = 1) {
  const campaign = ctx.campaignId
    ? await entity<{ budgetCampaignId?: string; frozen?: boolean }>(
        ctx.campaignId,
        ctx.workspaceId,
        'campaign',
      )
    : null;
  if (campaign?.payload.frozen)
    throw new Error(
      'Campaign is frozen. An owner must resume it before paid work.',
    );
  if (campaign?.payload.budgetCampaignId) {
    const original = await entity<{ frozen?: boolean }>(
      campaign.payload.budgetCampaignId,
      ctx.workspaceId,
      'campaign',
    );
    if (original.payload.frozen)
      throw new Error('Original campaign is frozen.');
  }
  const price = Number(required('COST_' + tariff));
  if (!Number.isFinite(price) || price <= 0)
    throw new Error(
      `Configure a positive conservative COST_${tariff} estimate in USD.`,
    );
  return rpc('reserve_budget', {
    p_id: crypto.randomUUID(),
    p_workspace: ctx.workspaceId,
    p_campaign: campaign?.payload.budgetCampaignId ?? ctx.campaignId ?? null,
    p_amount: price * units,
    p_purpose: tariff,
  });
}
