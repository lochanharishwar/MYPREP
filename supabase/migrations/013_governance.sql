alter table memberships add column brand_access text not null default 'all' check(brand_access in ('all','assigned'));
alter table memberships add column customer_access boolean not null default false;
alter table memberships add column export_access boolean not null default false;
alter table memberships add column approval_stages text[] not null default array['brand'];
alter table invitations add column expires_at timestamptz not null default now()+interval '7 days';
alter table workspaces add column require_mfa boolean not null default false;
alter table workspaces add column session_hours int not null default 24 check(session_hours between 1 and 720);
alter table workspaces add column approval_policy jsonb not null default '{"stages":["brand"],"separationOfDuties":false,"expiresHours":168}';
create table brand_permissions(workspace_id uuid not null,brand_id uuid not null,user_id uuid not null,primary key(brand_id,user_id),foreign key(workspace_id,user_id) references memberships(workspace_id,user_id) on delete cascade,foreign key(workspace_id,brand_id) references brands(workspace_id,id) on delete cascade);
alter table brand_permissions enable row level security;
create or replace function public.brand_access_for_user(p_brand uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from brands b join memberships m on m.workspace_id=b.workspace_id where b.id=p_brand and m.user_id=p_user and (m.role='owner' or m.brand_access='all' or exists(select 1 from brand_permissions p where p.brand_id=b.id and p.user_id=m.user_id)))$$;
create or replace function public.customer_access_for_user(p_workspace uuid,p_user uuid) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_user and (role='owner' or customer_access))$$;
drop policy read_brands on brands;
create policy read_brands on brands for select to authenticated using(brand_access_for_user(id,auth.uid()));
drop policy read_entities on entities;
create policy read_entities on entities for select to authenticated using(is_member(workspace_id) and (brand_id is null or brand_access_for_user(brand_id,auth.uid())) and kind not in ('oauth_state','tracking_secret') and (kind not in ('customers','accounts','feedback_summary') or customer_access_for_user(workspace_id,auth.uid())) and (kind<>'content' or payload->>'status' in ('qualified','approved','draft')));
drop policy read_events on journey_events;
create policy read_events on journey_events for select to authenticated using(brand_access_for_user(brand_id,auth.uid()) and customer_access_for_user(workspace_id,auth.uid()));
drop policy read_feedback on feedback;
create policy read_feedback on feedback for select to authenticated using(brand_access_for_user(brand_id,auth.uid()) and customer_access_for_user(workspace_id,auth.uid()));
create or replace function public.accept_invitations() returns void language plpgsql security definer set search_path=public as $$begin if auth.uid() is null then raise exception 'Sign in required';end if;insert into memberships(workspace_id,user_id,role) select workspace_id,auth.uid(),role from invitations where lower(email)=lower(auth.jwt()->>'email') and expires_at>now() on conflict do nothing;delete from invitations where lower(email)=lower(auth.jwt()->>'email');end$$;
create or replace function public.manage_member(p_workspace uuid,p_actor uuid,p_user uuid,p_action text,p_role text default null,p_brands uuid[] default null,p_customer boolean default false,p_export boolean default false) returns void language plpgsql security definer set search_path=public as $$begin
 perform 1 from workspaces where id=p_workspace for update;
 if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='owner') then raise exception 'Owner required';end if;
 if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_user) then raise exception 'Member not found';end if;
 if p_action='transfer' then update memberships set role='owner' where workspace_id=p_workspace and user_id=p_user;update memberships set role='editor' where workspace_id=p_workspace and user_id=p_actor and user_id<>p_user;
 elsif p_action='remove' then
  if exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_user and role='owner') and (select count(*) from memberships where workspace_id=p_workspace and role='owner')<=1 then raise exception 'Transfer ownership before removing the last owner';end if;
  delete from memberships where workspace_id=p_workspace and user_id=p_user;
 elsif p_action='update' then
  if p_role not in ('owner','editor','approver','viewer') then raise exception 'Invalid role';end if;
  if p_role<>'owner' and exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_user and role='owner') and (select count(*) from memberships where workspace_id=p_workspace and role='owner')<=1 then raise exception 'Keep at least one owner';end if;
  update memberships set role=p_role,brand_access=case when p_brands is null then 'all' else 'assigned' end,customer_access=p_customer,export_access=p_export where workspace_id=p_workspace and user_id=p_user;
  delete from brand_permissions where workspace_id=p_workspace and user_id=p_user;
  if p_brands is not null then insert into brand_permissions select p_workspace,b,p_user from unnest(p_brands)b;end if;
 else raise exception 'Invalid membership action';end if;
 insert into audit_log(workspace_id,actor_id,action,resource_id) values(p_workspace,p_actor,'member.'||p_action,p_user);
end$$;
create table approval_decisions(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces on delete cascade,brand_id uuid not null,content_id uuid not null references entities on delete cascade,account_id uuid not null references entities,actor_id uuid not null,stage text not null check(stage in ('creative','brand','legal')),content_hash text not null,created_at timestamptz not null default now(),unique(content_id,account_id,stage,content_hash));
alter table approval_decisions enable row level security;
create policy decisions_read on approval_decisions for select to authenticated using(brand_access_for_user(brand_id,auth.uid()));
create or replace function public.decide_approval(p_workspace uuid,p_content uuid,p_account uuid,p_user uuid,p_hash text,p_stage text default 'brand') returns jsonb language plpgsql security definer set search_path=public as $$declare c entities;policy jsonb;stages text[];approval_id uuid;begin
 select * into c from entities where id=p_content and workspace_id=p_workspace and kind='content' for update;
 if c.id is null or c.payload->>'contentHash'<>p_hash then raise exception 'Content version changed';end if;
 if not brand_access_for_user(c.brand_id,p_user) or not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_user and (role='owner' or (role='approver' and p_stage=any(approval_stages)))) then raise exception 'This approval stage requires an authorized reviewer';end if;
 select approval_policy into policy from workspaces where id=p_workspace;select array_agg(value) into stages from jsonb_array_elements_text(policy->'stages');
 if not p_stage=any(stages) then raise exception 'Stage not in workspace policy';end if;
 if (policy->>'separationOfDuties')::boolean and (c.payload->>'createdBy'=p_user::text or exists(select 1 from approval_decisions where content_id=p_content and account_id=p_account and content_hash=p_hash and actor_id=p_user and stage<>p_stage)) then raise exception 'A different reviewer is required for separation of duties';end if;
 insert into approval_decisions(workspace_id,brand_id,content_id,account_id,actor_id,stage,content_hash) values(p_workspace,c.brand_id,p_content,p_account,p_user,p_stage,p_hash) on conflict do nothing;
 insert into audit_log(workspace_id,brand_id,actor_id,action,resource_id,details) values(p_workspace,c.brand_id,p_user,'approval.stage',p_content,jsonb_build_object('stage',p_stage,'contentHash',p_hash));
 if exists(select 1 from unnest(stages)s where not exists(select 1 from approval_decisions d where d.content_id=p_content and d.account_id=p_account and d.stage=s and d.content_hash=p_hash)) then return jsonb_build_object('status','awaiting_stages');end if;
 approval_id=approve_content(p_workspace,p_content,p_account,p_user,p_hash);
 update entities set payload=payload||jsonb_build_object('expiresAt',now()+make_interval(hours=>(policy->>'expiresHours')::int),'policy',policy) where id=approval_id;
 return jsonb_build_object('id',approval_id,'status','approved');
end$$;
create or replace function public.guard_approval_policy() returns trigger language plpgsql security definer set search_path=public as $$declare a entities;c entities;begin
 if new.kind='schedule' and new.payload->>'status' in ('scheduled','uploading','publishing') then
  select * into a from entities where id=(new.payload->>'approvalId')::uuid;
  select * into c from entities where id=(new.payload->>'contentId')::uuid;
  if a.payload ? 'revokedAt' or ((a.payload->>'expiresAt') is not null and (a.payload->>'expiresAt')::timestamptz<=greatest(now(),(new.payload->>'scheduledAt')::timestamptz)) then raise exception 'Approval expired or revoked';end if;
  if exists(select 1 from entities where id=(c.payload->>'campaignId')::uuid and (payload->>'frozen')::boolean) then raise exception 'Campaign is frozen';end if;
 end if;return new;
end$$;
create trigger enforce_approval_policy before insert or update on entities for each row execute function public.guard_approval_policy();
revoke all on function public.manage_member(uuid,uuid,uuid,text,text,uuid[],boolean,boolean),public.decide_approval(uuid,uuid,uuid,uuid,text,text),public.guard_approval_policy() from public,anon,authenticated;
grant execute on function public.manage_member(uuid,uuid,uuid,text,text,uuid[],boolean,boolean),public.decide_approval(uuid,uuid,uuid,uuid,text,text) to service_role;
