create table public.media_jobs(id uuid primary key,workspace_id uuid not null references workspaces on delete cascade,brand_id uuid not null,input jsonb not null,status text not null default 'queued' check(status in ('queued','processing','completed','failed')),attempts int not null default 0,lease_until timestamptz,result jsonb,error text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(workspace_id,brand_id) references brands(workspace_id,id) on delete cascade);
alter table public.media_jobs enable row level security;
create policy media_jobs_read on public.media_jobs for select to authenticated using(is_member(workspace_id));
create or replace function public.enqueue_media(p_id uuid,p_workspace uuid,p_brand uuid,p_input jsonb) returns uuid language plpgsql security definer set search_path=public as $$declare existing media_jobs;begin
 if p_input->>'assetPath' not like p_workspace::text||'/'||p_brand::text||'/%' or p_input->>'assetPath' like '%..%' then raise exception 'Invalid scoped asset';end if;
 insert into media_jobs(id,workspace_id,brand_id,input) values(p_id,p_workspace,p_brand,p_input) on conflict do nothing;
 select * into existing from media_jobs where id=p_id;if existing.workspace_id<>p_workspace or existing.brand_id<>p_brand or existing.input<>p_input then raise exception 'Media job idempotency conflict';end if;
 insert into workflow_outbox(id,name,data) values('media-'||p_id::text,'media/prepare',jsonb_build_object('jobId',p_id,'workspaceId',p_workspace,'brandId',p_brand)) on conflict do nothing;return p_id;
end$$;
create or replace function public.claim_media(p_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$declare job media_jobs;begin
 update media_jobs set status='processing',attempts=attempts+1,lease_until=now()+interval '11 minutes',updated_at=now() where id=p_id and attempts<3 and (status='queued' or (status='processing' and lease_until<now())) returning * into job;return case when job.id is null then null else to_jsonb(job) end;
end$$;
revoke all on function public.enqueue_media(uuid,uuid,uuid,jsonb),public.claim_media(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_media(uuid,uuid,uuid,jsonb),public.claim_media(uuid) to service_role;
