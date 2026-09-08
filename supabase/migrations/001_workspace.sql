create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;
create table public.workspaces(id uuid primary key default gen_random_uuid(),name text not null,monthly_limit numeric(14,4) not null default 0 check(monthly_limit>=0),currency text not null default 'USD' check(currency='USD'),created_at timestamptz not null default now());
create table public.memberships(workspace_id uuid references public.workspaces on delete cascade,user_id uuid references auth.users on delete cascade,role text not null check(role in ('owner','editor','approver','viewer')),primary key(workspace_id,user_id));
create table public.invitations(id uuid primary key default gen_random_uuid(),workspace_id uuid references public.workspaces on delete cascade,email text not null,role text not null check(role in ('editor','approver','viewer')),unique(workspace_id,email));
create table public.brands(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,name text not null,website text not null,created_at timestamptz default now(),unique(workspace_id,id));
create table public.entities(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,brand_id uuid,kind text not null,payload jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete cascade);
create index entities_scope on public.entities(workspace_id,brand_id,kind,created_at desc);
create index entities_payload on public.entities using gin(payload);
create table public.credentials(entity_id uuid primary key references public.entities on delete cascade,encrypted text not null);
create table public.budget_ledger(id uuid primary key,workspace_id uuid not null references public.workspaces on delete cascade,campaign_id uuid references public.entities on delete set null,amount numeric(14,4) not null check(amount>=0),purpose text not null,estimated boolean not null default true,created_at timestamptz default now());
create index budget_month on public.budget_ledger(workspace_id,created_at);
create table public.journey_events(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,brand_id uuid not null,event_id text not null,occurred_at timestamptz not null,type text not null,anonymous_id text,customer_id text,account_id text,campaign_id uuid,channel text not null default 'direct',amount numeric(16,4),currency text,order_id text,source text not null check(source in ('browser','server','import')),properties jsonb not null default '{}',created_at timestamptz default now(),unique(brand_id,event_id),foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete cascade,check(type not in ('purchase','refund') or (source<>'browser' and amount>=0 and currency ~ '^[A-Z]{3}$' and order_id is not null)));
create unique index purchase_order_once on public.journey_events(brand_id,order_id) where type='purchase';
create index event_journeys on public.journey_events(brand_id,customer_id,occurred_at);
create table public.feedback(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces on delete cascade,brand_id uuid not null,source_id text not null,customer_id text,body text not null,url text,embedding extensions.vector(768),created_at timestamptz default now(),unique(brand_id,source_id),foreign key(workspace_id,brand_id) references public.brands(workspace_id,id) on delete cascade);
create or replace function public.is_member(w uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from memberships where workspace_id=w and user_id=auth.uid())$$;
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.brands enable row level security;
alter table public.entities enable row level security;
alter table public.credentials enable row level security;
alter table public.budget_ledger enable row level security;
alter table public.journey_events enable row level security;
alter table public.feedback enable row level security;
alter table public.invitations enable row level security;
create policy read_workspace on public.workspaces for select to authenticated using(public.is_member(id));
create policy read_members on public.memberships for select to authenticated using(public.is_member(workspace_id));
create policy read_brands on public.brands for select to authenticated using(public.is_member(workspace_id));
-- All mutations go through authenticated API handlers. Service role is never sent to browsers.
create policy read_entities on public.entities for select to authenticated using(public.is_member(workspace_id) and kind not in ('oauth_state','tracking_secret') and (kind<>'content' or payload->>'status' in ('qualified','approved')));
create policy read_events on public.journey_events for select to authenticated using(public.is_member(workspace_id));
create policy read_feedback on public.feedback for select to authenticated using(public.is_member(workspace_id));
create policy read_budget on public.budget_ledger for select to authenticated using(public.is_member(workspace_id));
create or replace function public.create_workspace(p_name text) returns uuid language plpgsql security definer set search_path=public as $$declare w uuid;begin if auth.uid() is null then raise exception 'Sign in required';end if;if length(trim(p_name))<2 or length(p_name)>100 then raise exception 'Invalid workspace name';end if;insert into workspaces(name) values(trim(p_name)) returning id into w;insert into memberships values(w,auth.uid(),'owner');return w;end$$;
create or replace function public.accept_invitations() returns void language plpgsql security definer set search_path=public as $$begin if auth.uid() is null then raise exception 'Sign in required';end if;insert into memberships select workspace_id,auth.uid(),role from invitations where lower(email)=lower(auth.jwt()->>'email') on conflict do nothing;delete from invitations where lower(email)=lower(auth.jwt()->>'email');end$$;
create or replace function public.reserve_budget(p_id uuid,p_workspace uuid,p_campaign uuid,p_amount numeric,p_purpose text) returns uuid language plpgsql security definer set search_path=public as $$declare cap numeric;used numeric;campaign_cap numeric;begin
 select monthly_limit into cap from workspaces where id=p_workspace for update;
 if cap is null or cap<=0 or p_amount<=0 then raise exception 'Owner must configure a monthly spending limit and provider cost estimates';end if;
 if exists(select 1 from budget_ledger where id=p_id and workspace_id=p_workspace) then return p_id;end if;
 select coalesce(sum(amount),0) into used from budget_ledger where workspace_id=p_workspace and created_at>=date_trunc('month',now());
 if used+p_amount>cap then raise exception 'Monthly spending limit reached';end if;
 if p_campaign is not null then select (payload->>'budget')::numeric into campaign_cap from entities where id=p_campaign and workspace_id=p_workspace and kind='campaign';if campaign_cap is null then raise exception 'Campaign not found';end if;select coalesce(sum(amount),0) into used from budget_ledger where campaign_id=p_campaign;if used+p_amount>campaign_cap then raise exception 'Campaign spending limit reached';end if;end if;
 insert into budget_ledger(id,workspace_id,campaign_id,amount,purpose) values(p_id,p_workspace,p_campaign,p_amount,p_purpose);return p_id;end$$;
create or replace function public.approve_content(p_workspace uuid,p_content uuid,p_account uuid,p_user uuid,p_hash text) returns uuid language plpgsql security definer set search_path=public as $$declare c entities;a entities;approval_id uuid;begin
 select * into c from entities where id=p_content and workspace_id=p_workspace and kind='content' for update;
 select * into a from entities where id=p_account and workspace_id=p_workspace and brand_id=c.brand_id and kind='connection' for update;
 if c.id is null or c.payload->>'status' not in ('qualified','approved') or coalesce((c.payload#>>'{review,score}')::numeric,0)<8.7 or c.payload->>'contentHash'<>p_hash then raise exception 'Only a qualifying, unchanged version can be approved';end if;
 if a.id is null or a.payload->>'platform'<>c.payload->>'platform' or a.payload->>'status'<>'connected' then raise exception 'Connect a matching destination account';end if;
 insert into entities(workspace_id,brand_id,kind,payload) values(p_workspace,c.brand_id,'approval',jsonb_build_object('contentId',p_content,'contentHash',p_hash,'accountId',p_account,'platform',c.payload->>'platform','approvedBy',p_user,'approvedAt',now())) returning id into approval_id;
 update entities set payload=jsonb_set(payload,'{status}','"approved"'),updated_at=now() where id=p_content;return approval_id;end$$;
create or replace function public.schedule_post(p_workspace uuid,p_approval uuid,p_at timestamptz,p_timezone text) returns uuid language plpgsql security definer set search_path=public as $$declare a entities;c entities;sid uuid;begin
 select * into a from entities where id=p_approval and workspace_id=p_workspace and kind='approval' for update;
 if a.id is null then raise exception 'Approval not found';end if;
 select * into c from entities where id=(a.payload->>'contentId')::uuid and workspace_id=p_workspace and kind='content';
 if c.id is null or c.payload->>'status'<>'approved' or c.payload->>'contentHash'<>a.payload->>'contentHash' or p_at<=now() then raise exception 'Approval is stale or the scheduled time is in the past';end if;
 if exists(select 1 from entities where kind='schedule' and payload->>'approvalId'=p_approval::text and payload->>'status' not in ('cancelled','failed','missed')) then raise exception 'This approval already has a scheduled or published post';end if;
 insert into entities(workspace_id,brand_id,kind,payload) values(p_workspace,a.brand_id,'schedule',jsonb_build_object('approvalId',p_approval,'contentId',c.id,'accountId',a.payload->>'accountId','platform',a.payload->>'platform','scheduledAt',p_at,'timezone',p_timezone,'status','scheduled','revision',1)) returning id into sid;return sid;end$$;
create or replace function public.change_schedule(p_workspace uuid,p_id uuid,p_action text,p_at timestamptz default null,p_timezone text default null) returns jsonb language plpgsql security definer set search_path=public as $$declare s entities;p jsonb;begin
 select * into s from entities where id=p_id and workspace_id=p_workspace and kind='schedule' for update;
 if s.id is null or s.payload->>'status' not in ('scheduled','failed','missed') then raise exception 'This post has already been dispatched and cannot be changed';end if;
 p=s.payload||jsonb_build_object('revision',(s.payload->>'revision')::int+1);
 if p_action='cancel' then p=p||'{"status":"cancelled"}'::jsonb;elsif p_action='reschedule' and p_at>now() then p=p||jsonb_build_object('status','scheduled','scheduledAt',p_at,'timezone',p_timezone);else raise exception 'Invalid schedule change';end if;
 update entities set payload=p,updated_at=now() where id=p_id;return p;end$$;
create or replace function public.claim_publication(p_id uuid,p_revision int) returns jsonb language plpgsql security definer set search_path=public as $$declare s entities;c entities;a entities;begin
 select * into s from entities where id=p_id and kind='schedule' for update;
 if s.id is null or s.payload->>'status'<>'scheduled' or (s.payload->>'revision')::int<>p_revision then return null;end if;
 if (s.payload->>'scheduledAt')::timestamptz>now() then return null;end if;
 if (s.payload->>'scheduledAt')::timestamptz<now()-interval '15 minutes' then update entities set payload=payload||'{"status":"missed","error":"Delivery window elapsed. Reschedule this post."}'::jsonb where id=p_id;return null;end if;
 select * into a from entities where id=(s.payload->>'approvalId')::uuid and kind='approval' and workspace_id=s.workspace_id;
 select * into c from entities where id=(s.payload->>'contentId')::uuid and kind='content' and workspace_id=s.workspace_id;
 if a.id is null or c.id is null or c.payload->>'status'<>'approved' or c.payload->>'contentHash'<>a.payload->>'contentHash' then raise exception 'Approval no longer matches';end if;
 update entities set payload=payload||'{"status":"uploading"}'::jsonb,updated_at=now() where id=p_id;return to_jsonb(s);end$$;
create or replace function public.reject_content(p_workspace uuid,p_id uuid) returns text language plpgsql security definer set search_path=public as $$declare c entities;begin select * into c from entities where id=p_id and workspace_id=p_workspace and kind='content' for update;if c.id is null then raise exception 'Content not found';end if;if exists(select 1 from entities where kind='schedule' and payload->>'contentId'=p_id::text and payload->>'status' not in ('cancelled','failed','missed')) then raise exception 'Cancel the schedule before rejecting content';end if;delete from entities where workspace_id=p_workspace and kind='approval' and payload->>'contentId'=p_id::text;delete from entities where id=p_id;insert into entities(workspace_id,brand_id,kind,payload) values(p_workspace,c.brand_id,'audit',jsonb_build_object('action','rejected','contentId',p_id));return c.payload->>'assetPath';end$$;
create or replace function public.match_feedback(p_brand uuid,p_embedding extensions.vector(768),p_limit int default 8) returns table(id uuid,body text,url text,similarity float) language sql stable security definer set search_path=public,extensions as $$select f.id,f.body,f.url,1-(f.embedding<=>p_embedding) from feedback f where f.brand_id=p_brand and f.embedding is not null and 1-(f.embedding<=>p_embedding)>0.35 order by f.embedding<=>p_embedding limit least(p_limit,20)$$;
-- Elevated orchestration functions are callable only by the API's service role.
revoke all on function public.reserve_budget(uuid,uuid,uuid,numeric,text),public.approve_content(uuid,uuid,uuid,uuid,text),public.schedule_post(uuid,uuid,timestamptz,text),public.change_schedule(uuid,uuid,text,timestamptz,text),public.claim_publication(uuid,int),public.reject_content(uuid,uuid),public.match_feedback(uuid,extensions.vector,int) from public,anon,authenticated;
grant execute on function public.reserve_budget(uuid,uuid,uuid,numeric,text),public.approve_content(uuid,uuid,uuid,uuid,text),public.schedule_post(uuid,uuid,timestamptz,text),public.change_schedule(uuid,uuid,text,timestamptz,text),public.claim_publication(uuid,int),public.reject_content(uuid,uuid),public.match_feedback(uuid,extensions.vector,int) to service_role;
revoke all on function public.create_workspace(text),public.accept_invitations() from public,anon;
grant execute on function public.create_workspace(text),public.accept_invitations() to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('media','media',false,262144000,array['image/png','image/jpeg','image/webp','video/mp4','application/pdf','text/plain']) on conflict(id) do nothing;
create policy read_brand_media on storage.objects for select to authenticated using(bucket_id='media' and exists(select 1 from memberships where user_id=auth.uid() and workspace_id::text=(storage.foldername(name))[1]));

