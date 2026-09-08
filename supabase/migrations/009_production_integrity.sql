-- Preserve confirmed publication and enqueue its follow-up in the same commit.
alter table public.workflow_outbox add column attempts int not null default 0;
alter table public.workflow_outbox add column next_attempt_at timestamptz not null default now();
alter table public.workflow_outbox add column dead_at timestamptz;
alter table public.entities add column schema_version int not null default 1 check(schema_version>0);
alter table public.journey_events add column schema_version int not null default 1 check(schema_version>0);
create table public.audit_log(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces on delete cascade,brand_id uuid,actor_id uuid,action text not null,resource_id uuid,request_id uuid,outcome text not null default 'committed',details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.audit_log enable row level security;
create policy audit_owner_read on public.audit_log for select to authenticated using(exists(select 1 from memberships where workspace_id=audit_log.workspace_id and user_id=auth.uid() and role='owner'));
create index audit_scope_time on public.audit_log(workspace_id,created_at desc);
create or replace function public.guard_schedule_terminal() returns trigger language plpgsql set search_path=public as $$begin
 if old.kind='schedule' and old.payload->>'status'='published' and new.payload->>'status' is distinct from 'published' then raise exception 'Confirmed publication is terminal';end if;return new;end$$;
create trigger protect_published before update on public.entities for each row execute function public.guard_schedule_terminal();
create or replace function public.entity_outbox() returns trigger language plpgsql security definer set search_path=public as $$declare event_name text;event_id text;event_data jsonb;begin
 if new.kind='schedule' and new.payload->>'status'='scheduled' and (tg_op='INSERT' or old.payload->>'revision' is distinct from new.payload->>'revision') then
  event_name='post/schedule';event_id=new.id::text||'-'||(new.payload->>'revision');event_data=jsonb_build_object('scheduleId',new.id,'revision',(new.payload->>'revision')::int);
 elsif new.kind='schedule' and new.payload->>'status'='published' and (tg_op='INSERT' or old.payload->>'status' is distinct from 'published') then
  event_name='post/feedback';event_id=new.id::text||'-feedback-initial';event_data=jsonb_build_object('scheduleId',new.id);
 elsif new.kind='scan' and new.payload->>'status'='queued' and (tg_op='INSERT' or old.payload->>'status' is distinct from 'queued') then
  event_name='brand/scan';event_id=new.id::text||'-batch-'||coalesce(new.payload->>'batch','0');event_data=jsonb_build_object('scanId',new.id);
 elsif new.kind='campaign' and new.payload->>'status'='queued' and tg_op='INSERT' then
  event_name='campaign/generate';event_id=new.id::text;event_data=jsonb_build_object('campaignId',new.id);
 end if;
 if event_id is not null then insert into workflow_outbox(id,name,data) values(event_id,event_name,event_data||jsonb_build_object('workspaceId',new.workspace_id,'brandId',new.brand_id)) on conflict do nothing;end if;
 return new;
end$$;
create trigger persist_business_outbox after insert or update on public.entities for each row execute function public.entity_outbox();
create or replace function public.enqueue_insight() returns trigger language plpgsql security definer set search_path=public as $$begin
 insert into workflow_outbox(id,name,data,next_attempt_at) values('insights-'||new.brand_id::text||'-'||floor(extract(epoch from now())/600)::text,'brand/insights',jsonb_build_object('workspaceId',new.workspace_id,'brandId',new.brand_id),now()+interval '10 minutes') on conflict do nothing;return new;end$$;
create trigger events_insight_outbox after insert on public.journey_events for each row execute function public.enqueue_insight();
create trigger feedback_insight_outbox after insert or update of body on public.feedback for each row execute function public.enqueue_insight();
-- A deletion never removes another explicitly identified customer's records.
create or replace function public.delete_customer(p_workspace uuid,p_brand uuid,p_customer text) returns void language plpgsql security definer set search_path=public as $$declare exclusive_ids text[];removed_events int;removed_feedback int;begin
 perform 1 from brands where workspace_id=p_workspace and id=p_brand for update;if not found then raise exception 'Brand not found';end if;
 select array_agg(anonymous_id) into exclusive_ids from (select anonymous_id from journey_events where workspace_id=p_workspace and brand_id=p_brand and anonymous_id is not null group by anonymous_id having count(distinct customer_id)=1 and min(customer_id)=p_customer)x;
 delete from journey_events where workspace_id=p_workspace and brand_id=p_brand and (customer_id=p_customer or (customer_id is null and anonymous_id=any(exclusive_ids)));get diagnostics removed_events=row_count;
 delete from feedback where workspace_id=p_workspace and brand_id=p_brand and customer_id=p_customer;get diagnostics removed_feedback=row_count;
 delete from entities where workspace_id=p_workspace and brand_id=p_brand and ((kind='customers' and payload->>'customerId'=p_customer) or kind in ('insight','attribution','markov','feedback_summary'));
 insert into audit_log(workspace_id,brand_id,action,details) values(p_workspace,p_brand,'customer.deleted',jsonb_build_object('eventsDeleted',removed_events,'feedbackDeleted',removed_feedback,'sharedAnonymousPolicy','retain-unassigned-shared-events'));
end$$;
revoke all on function public.guard_schedule_terminal(),public.entity_outbox(),public.enqueue_insight() from public,anon,authenticated;
