-- Commands, their result, audit record and outbox are one PostgreSQL transaction.
create table command_receipts(workspace_id uuid not null references workspaces on delete cascade,actor_id uuid not null,command_id uuid not null,action text not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,actor_id,command_id));
alter table command_receipts enable row level security;
create or replace function public.business_command(p_workspace uuid,p_actor uuid,p_key uuid,p_action text,p_request jsonb,p_args jsonb) returns jsonb language plpgsql security definer set search_path=public as $$declare receipt command_receipts;r jsonb;e entities;sid uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text||p_actor::text||p_key::text,0));
 select * into receipt from command_receipts where workspace_id=p_workspace and actor_id=p_actor and command_id=p_key;
 if found then if receipt.action<>p_action or receipt.request<>p_request then raise exception 'Idempotency key reused for a different command';end if;return receipt.result;end if;
 if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor) then raise exception 'Membership required';end if;
 if p_action in ('scan','campaign','redo','draft') then
  if not brand_access_for_user((p_args->>'brandId')::uuid,p_actor) or not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role in ('owner','editor')) then raise exception 'Editor with brand access required';end if;
  insert into entities(workspace_id,brand_id,kind,payload) values(p_workspace,(p_args->>'brandId')::uuid,p_args->>'kind',p_args->'payload'||jsonb_build_object('createdBy',p_actor)) returning * into e;r=to_jsonb(e);
 elsif p_action in ('schedule','change-schedule') then
  if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role in ('owner','approver')) then raise exception 'Approver required';end if;
  select * into e from entities where workspace_id=p_workspace and id=(p_args->>'id')::uuid;
  if e.id is null or not brand_access_for_user(e.brand_id,p_actor) then raise exception 'Brand access denied';end if;
  if p_action='schedule' then sid=schedule_post(p_workspace,e.id,(p_args->>'at')::timestamptz,p_args->>'timezone');r=jsonb_build_object('id',sid);
  else r=change_schedule(p_workspace,e.id,p_args->>'command',(p_args->>'at')::timestamptz,p_args->>'timezone');end if;
 else raise exception 'Unsupported atomic command';end if;
 insert into command_receipts values(p_workspace,p_actor,p_key,p_action,p_request,r,now());
 insert into audit_log(workspace_id,actor_id,action,request_id,resource_id) values(p_workspace,p_actor,p_action,p_key,coalesce(sid,e.id));
 return r;
end$$;
-- A dispatched request remains uncertain until verified; revocation cancels only unsent work.
create or replace function public.revoke_approval(p_workspace uuid,p_id uuid,p_actor uuid) returns void language plpgsql security definer set search_path=public as $$begin
 perform 1 from workspaces where id=p_workspace for update;
 if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='owner') then raise exception 'Owner required';end if;
 update entities set payload=payload||jsonb_build_object('revokedAt',now(),'revokedBy',p_actor),updated_at=now() where id=p_id and workspace_id=p_workspace and kind='approval';if not found then raise exception 'Approval not found';end if;
 update entities set payload=payload||jsonb_build_object('status','cancelled','revision',(payload->>'revision')::int+1,'error','Approval revoked'),updated_at=now() where workspace_id=p_workspace and kind='schedule' and payload->>'approvalId'=p_id::text and payload->>'status' in ('scheduled','uploading','publishing','failed','missed') and not(payload ? 'dispatchStartedAt');
 insert into audit_log(workspace_id,actor_id,action,resource_id) values(p_workspace,p_actor,'approval.revoked',p_id);
end$$;
create or replace function public.claim_provider_dispatch(p_id uuid,p_revision int) returns boolean language plpgsql security definer set search_path=public as $$declare ws uuid;begin
 select workspace_id into ws from entities where id=p_id and kind='schedule';
 perform 1 from workspaces where id=ws and not publishing_paused for update;if not found then return false;end if;
 update entities set payload=payload||jsonb_build_object('dispatchStartedAt',now()),updated_at=now() where id=p_id and kind='schedule' and payload->>'status'='publishing' and (payload->>'revision')::int=p_revision and not(payload ? 'dispatchStartedAt');return found;
end$$;
create or replace function public.repair_job_delivery() returns jsonb language plpgsql security definer set search_path=public as $$declare repaired int;media_count int;begin
 insert into workflow_outbox(id,name,data)
 select id::text||'-'||(payload->>'revision'),'post/schedule',jsonb_build_object('scheduleId',id,'revision',(payload->>'revision')::int,'workspaceId',workspace_id,'brandId',brand_id)
 from entities where kind='schedule' and payload->>'status'='scheduled' on conflict do nothing;
 get diagnostics repaired=row_count;
 -- Once the delivery window has elapsed, ask for explicit rescheduling, never post late.
 update entities set payload=payload||jsonb_build_object('status','missed','error','Delivery window elapsed. Inspect the queue and reschedule.'),updated_at=now() where kind='schedule' and payload->>'status'='scheduled' and (payload->>'scheduledAt')::timestamptz<now()-interval '15 minutes';
 insert into workflow_outbox(id,name,data)
 select 'media-'||id::text||'-recovery-'||attempts::text,'media/prepare',jsonb_build_object('jobId',id,'workspaceId',workspace_id,'brandId',brand_id) from media_jobs where (status='queued' and created_at<now()-interval '12 minutes') or (status='processing' and lease_until<now() and attempts<3) on conflict do nothing;
 get diagnostics media_count=row_count;
 update media_jobs set status='failed',error='Processor lease expired after three attempts; inspect worker logs.',updated_at=now() where status='processing' and lease_until<now() and attempts>=3;
 return jsonb_build_object('scheduleOutboxRestored',repaired,'mediaRetriesQueued',media_count);
end$$;
-- Service credentials are the only write path; even they cannot rewrite audit events.
create or replace function public.append_only_audit() returns trigger language plpgsql as $$begin raise exception 'Audit history is append-only';end$$;
create trigger audit_no_rewrite before update or delete on audit_log for each row execute function public.append_only_audit();
drop policy read_brand_media on storage.objects;
create policy read_brand_media on storage.objects for select to authenticated using(bucket_id='media' and exists(select 1 from brands where workspace_id::text=(storage.foldername(name))[1] and id::text=(storage.foldername(name))[2] and brand_access_for_user(id,auth.uid())));
drop policy media_jobs_read on media_jobs;
create policy media_jobs_read on media_jobs for select to authenticated using(brand_access_for_user(brand_id,auth.uid()));
create index entities_jobs_cursor on entities(brand_id,updated_at,id) where kind in ('scan','campaign','schedule','activity');
revoke all on function public.business_command(uuid,uuid,uuid,text,jsonb,jsonb),public.revoke_approval(uuid,uuid,uuid),public.repair_job_delivery(),public.append_only_audit() from public,anon,authenticated;
grant execute on function public.business_command(uuid,uuid,uuid,text,jsonb,jsonb),public.revoke_approval(uuid,uuid,uuid),public.repair_job_delivery() to service_role;
