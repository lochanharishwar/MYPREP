create or replace function public.content_review_outbox() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.kind='content' and new.payload->>'status'='reviewing' and new.payload ? 'sourceVersionId' then
  insert into workflow_outbox(id,name,data) values('review-'||new.id::text,'content/review',jsonb_build_object('contentId',new.id,'workspaceId',new.workspace_id,'brandId',new.brand_id)) on conflict do nothing;
 end if;return new;
end$$;
create trigger persist_draft_review after insert on entities for each row execute function public.content_review_outbox();
create or replace function public.guard_dispatched_state() returns trigger language plpgsql as $$begin
 if old.kind='schedule' then
  if old.payload ? 'dispatchStartedAt' then new.payload=new.payload||jsonb_build_object('dispatchStartedAt',old.payload->'dispatchStartedAt');end if;
  if old.payload->>'status'='cancelled' and new.payload->>'status' not in ('cancelled','scheduled') then raise exception 'Cancelled publication cannot resume';end if;
 end if;return new;
end$$;
create trigger protect_dispatch_state before update on entities for each row execute function public.guard_dispatched_state();
revoke all on function public.content_review_outbox(),public.guard_dispatched_state() from public,anon,authenticated;
