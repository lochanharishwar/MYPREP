-- Preserve destination IDs on reconnect. Credentials and readiness commit together.
create or replace function public.reconnect_social_account(p_workspace uuid,p_brand uuid,p_actor uuid,p_connection jsonb,p_encrypted text)
returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid;
begin
  if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='owner') then raise exception 'Owner required';end if;
  perform 1 from brands where id=p_brand and workspace_id=p_workspace for update;
  if not found then raise exception 'Brand not found';end if;
  if coalesce(p_connection->>'platform','') not in ('instagram','youtube','x','linkedin','reddit') or coalesce(p_connection->>'accountId','')='' or coalesce(p_encrypted,'')='' then raise exception 'Invalid connection';end if;
  select id into result from entities where workspace_id=p_workspace and brand_id=p_brand and kind='connection'
    and payload->>'platform'=p_connection->>'platform' and payload->>'accountId'=p_connection->>'accountId'
    order by created_at,id limit 1 for update;
  if result is null then
    insert into entities(workspace_id,brand_id,kind,payload) values(p_workspace,p_brand,'connection',p_connection||'{"status":"connected"}') returning id into result;
  else
    update entities set payload=payload||p_connection||'{"status":"connected"}',updated_at=now() where id=result;
  end if;
  insert into credentials(entity_id,encrypted) values(result,p_encrypted) on conflict(entity_id) do update
    set encrypted=excluded.encrypted,version=credentials.version+1,refresh_owner=null,refresh_until=null;
  insert into audit_log(workspace_id,brand_id,actor_id,action,resource_id) values(p_workspace,p_brand,p_actor,'connection.authorized',result);
  return result;
end $$;
revoke all on function public.reconnect_social_account(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.reconnect_social_account(uuid,uuid,uuid,jsonb,text) to service_role;

-- The final dispatch gate shares the connection lock with disconnect/reconnect.
create or replace function public.claim_provider_dispatch(p_id uuid,p_revision int)
returns boolean language plpgsql security definer set search_path=public as $$
declare ws uuid;s entities;c entities;
begin
  select workspace_id into ws from entities where id=p_id and kind='schedule';
  perform 1 from workspaces where id=ws and not publishing_paused for update;
  if not found then return false;end if;
  select * into s from entities where id=p_id and kind='schedule' for update;
  if not found or s.payload->>'status' is distinct from 'publishing' or (s.payload->>'revision')::int is distinct from p_revision or s.payload ? 'dispatchStartedAt' then return false;end if;
  select * into c from entities where id::text=s.payload->>'accountId' and workspace_id=ws and brand_id=s.brand_id and kind='connection' for update;
  if not found or c.payload->>'status' is distinct from 'connected' or (s.payload ? 'platform' and c.payload->>'platform' is distinct from s.payload->>'platform') then return false;end if;
  if not exists(select 1 from credentials where entity_id=c.id) then return false;end if;
  update entities set payload=payload||jsonb_build_object('dispatchStartedAt',now()),updated_at=now() where id=p_id;
  return true;
end $$;
revoke all on function public.claim_provider_dispatch(uuid,int) from public,anon,authenticated;
grant execute on function public.claim_provider_dispatch(uuid,int) to service_role;

-- Watch time is additive in seconds; per-video percentages are not additive.
-- Normalize the historical watch_seconds key without double counting new rows.
create or replace function public.metric_report(p_brand uuid,p_start timestamptz,p_end timestamptz,p_platform text default null,p_campaign uuid default null,p_metric text default 'impressions')
returns jsonb language sql stable security definer set search_path=public as $$
 with observations as(
   select m.id,m.payload,m.created_at from entities m where m.brand_id=p_brand and m.kind='metrics'
   and (m.payload->>'observedAt')::timestamptz>=p_start and (m.payload->>'observedAt')::timestamptz<p_end
   and (p_platform is null or m.payload->>'platform'=p_platform)
   and (p_campaign is null or exists(select 1 from entities s join entities c on c.id=(s.payload->>'contentId')::uuid where s.id=(m.payload->>'postId')::uuid and c.payload->>'campaignId'=p_campaign::text))),
 latest as(select distinct on(payload->>'postId') * from observations order by payload->>'postId',(payload->>'observedAt')::timestamptz desc,id),
 metric_values as(select l.payload->>'platform' platform,case when j.key='watch_seconds' then 'watchTime' else j.key end key,(j.value::text)::numeric value
   from latest l cross join lateral jsonb_each(l.payload->'metrics') j where jsonb_typeof(j.value)='number'
   and j.key not in ('averageWatchPercentage','average_view_percentage')
   and (j.key<>'watch_seconds' or not ((l.payload->'metrics') ? 'watchTime'))),
 totals as(select key,sum(value) value from metric_values group by key),
 daily_post as(select distinct on((payload->>'observedAt')::timestamptz::date,payload->>'postId') (payload->>'observedAt')::timestamptz::date as snapshot_day,payload from observations order by (payload->>'observedAt')::timestamptz::date,payload->>'postId',(payload->>'observedAt')::timestamptz desc),
 daily as(select snapshot_day as date,sum(case when p_metric in ('averageWatchPercentage','average_view_percentage') then null when p_metric='watchTime' then coalesce(payload->'metrics'->>'watchTime',payload->'metrics'->>'watch_seconds')::numeric else (payload->'metrics'->>p_metric)::numeric end) value from daily_post group by snapshot_day),
 comparison as(select platform,sum(value) value from metric_values where key=p_metric group by platform)
 select jsonb_build_object('totals',coalesce((select jsonb_object_agg(key,value) from totals),'{}'::jsonb),'chart',coalesce((select jsonb_agg(d order by d.date) from daily d),'[]'::jsonb),'comparison',coalesce((select jsonb_agg(c) from comparison c),'[]'::jsonb),'latest',coalesce((select jsonb_agg(x) from(select * from latest order by created_at desc limit 50)x),'[]'::jsonb),'postCount',(select count(*) from latest),'observationCount',(select count(*) from observations),'complete',true,'periodStart',p_start,'periodEnd',p_end);
$$;
revoke all on function public.metric_report(uuid,timestamptz,timestamptz,text,uuid,text) from public,anon,authenticated;
grant execute on function public.metric_report(uuid,timestamptz,timestamptz,text,uuid,text) to service_role;
