insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('published-media','published-media',true,262144000,array['image/png','image/jpeg','video/mp4']) on conflict(id) do nothing;
create table public.ingest_limits(key text primary key,window_start timestamptz not null default now(),count int not null default 0);
alter table public.ingest_limits enable row level security;
create or replace function public.consume_ingest_limit(p_key text,p_max int default 120) returns boolean language plpgsql security definer set search_path=public as $$declare n int;begin insert into ingest_limits(key,count) values(p_key,1) on conflict(key) do update set count=case when ingest_limits.window_start<now()-interval '1 minute' then 1 else ingest_limits.count+1 end,window_start=case when ingest_limits.window_start<now()-interval '1 minute' then now() else ingest_limits.window_start end returning count into n;return n<=p_max;end$$;
create or replace function public.consume_oauth_state(p_id uuid,p_platform text) returns jsonb language plpgsql security definer set search_path=public as $$declare e entities;begin delete from entities where id=p_id and kind='oauth_state' and payload->>'platform'=p_platform and (payload->>'expiresAt')::numeric>extract(epoch from now())*1000 returning * into e;return case when e.id is null then null else to_jsonb(e) end;end$$;
create or replace function public.delete_customer(p_workspace uuid,p_brand uuid,p_customer text) returns void language plpgsql security definer set search_path=public as $$declare anonymous text[];begin
 select array_agg(distinct anonymous_id) into anonymous from journey_events where workspace_id=p_workspace and brand_id=p_brand and customer_id=p_customer;
 delete from journey_events where workspace_id=p_workspace and brand_id=p_brand and (customer_id=p_customer or anonymous_id=any(anonymous));
 delete from feedback where workspace_id=p_workspace and brand_id=p_brand and customer_id=p_customer;
 delete from entities where workspace_id=p_workspace and brand_id=p_brand and ((kind='customers' and payload->>'customerId'=p_customer) or kind in ('insight','attribution','markov'));
 end$$;
revoke all on function public.consume_ingest_limit(text,int),public.consume_oauth_state(uuid,text),public.delete_customer(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.consume_ingest_limit(text,int),public.consume_oauth_state(uuid,text),public.delete_customer(uuid,uuid,text) to service_role;
