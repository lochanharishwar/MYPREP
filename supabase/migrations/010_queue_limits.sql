alter table workspaces add column publishing_paused boolean not null default false;
alter table workspaces add column max_active_campaigns int not null default 3 check(max_active_campaigns between 1 and 50);
create or replace function public.queue_limits() returns trigger language plpgsql security definer set search_path=public as $$declare w workspaces;n int;begin
 if new.kind in ('campaign','scan') and new.payload->>'status'='queued' then
  select * into w from workspaces where id=new.workspace_id for update;
  select count(*) into n from entities where workspace_id=new.workspace_id and brand_id=new.brand_id and kind=new.kind and payload->>'status' in ('queued','running','generating','reviewing','crawling','building_dna');
  if n>=(case when new.kind='scan' then 1 else w.max_active_campaigns end) then raise exception 'Active job limit reached. Finish or cancel existing work before starting another job.';end if;
 end if;return new;
end$$;
create trigger enforce_queue_limits before insert on public.entities for each row execute function public.queue_limits();
create or replace function public.guard_publication_pause() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.kind='schedule' and new.payload->>'status' in ('scheduled','uploading','publishing') and exists(select 1 from workspaces where id=new.workspace_id and publishing_paused) then raise exception 'Workspace publishing is paused by an owner';end if;return new;
end$$;
create trigger enforce_publishing_pause before insert or update on public.entities for each row execute function public.guard_publication_pause();
revoke all on function public.queue_limits(),public.guard_publication_pause() from public,anon,authenticated;
