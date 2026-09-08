alter table public.feedback add column post_id uuid references public.entities(id) on delete set null;
create index feedback_post on public.feedback(brand_id,post_id);
create or replace function public.journey_details(p_brand uuid,p_customer text,p_offset int default 0) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(e),'[]'::jsonb) from (select event_id,occurred_at,type,channel,amount,currency,account_id,campaign_id,source from resolved_events where brand_id=p_brand and journey_id='customer:'||p_customer order by occurred_at,event_id offset greatest(0,p_offset) limit 100)e;
$$;
create or replace function public.journey_funnel(p_brand uuid) returns jsonb language sql stable security definer set search_path=public as $$
 with visitors as(select journey_id,min(occurred_at) start_at from resolved_events where brand_id=p_brand and type='page_view' group by journey_id),
 engaged as(select v.journey_id,min(e.occurred_at) engaged_at from visitors v join resolved_events e on e.brand_id=p_brand and e.journey_id=v.journey_id and e.type in ('engaged','click','video_progress') and e.occurred_at>=v.start_at group by v.journey_id),
 converted as(select distinct g.journey_id from engaged g join resolved_events e on e.brand_id=p_brand and e.journey_id=g.journey_id and e.type='purchase' and e.source<>'browser' and e.occurred_at>=g.engaged_at)
 select jsonb_build_object('visitors',(select count(*) from visitors),'engaged',(select count(*) from engaged),'purchasers',(select count(*) from converted),'totalEvents',(select count(*) from journey_events where brand_id=p_brand));
$$;
revoke all on function public.journey_details(uuid,text,int),public.journey_funnel(uuid) from public,anon,authenticated;
grant execute on function public.journey_details(uuid,text,int),public.journey_funnel(uuid) to service_role;
