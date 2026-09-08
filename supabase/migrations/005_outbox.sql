create table public.workflow_outbox(id text primary key,name text not null,data jsonb not null,status text not null default 'pending' check(status in ('pending','sent')),created_at timestamptz not null default now(),sent_at timestamptz,error text);
alter table public.workflow_outbox enable row level security;
create index workflow_pending on public.workflow_outbox(status,created_at);
create or replace function public.settle_budget(p_id uuid,p_actual numeric) returns void language plpgsql security definer set search_path=public as $$declare entry budget_ledger;begin
 select * into entry from budget_ledger where id=p_id for update;if entry.id is null or p_actual<0 then raise exception 'Invalid usage settlement';end if;
 update budget_ledger set amount=p_actual,estimated=false where id=p_id;
 -- Stop subsequent paid work if a configured upper estimate was too low.
 if p_actual>entry.amount then update workspaces set monthly_limit=0 where id=entry.workspace_id;end if;end$$;
revoke all on function public.settle_budget(uuid,numeric) from public,anon,authenticated;
grant execute on function public.settle_budget(uuid,numeric) to service_role;
