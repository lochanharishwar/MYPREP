-- Worker progress writes must never overwrite an owner's campaign freeze.
alter table entities add column campaign_frozen boolean not null default false;
update entities set campaign_frozen=coalesce((payload->>'frozen')::boolean,false) where kind='campaign';
create or replace function public.preserve_campaign_freeze() returns trigger language plpgsql as $$begin
 if new.kind='campaign' then new.payload=new.payload||jsonb_build_object('frozen',new.campaign_frozen);end if;return new;
end$$;
create trigger preserve_campaign_stop before insert or update on entities for each row execute function public.preserve_campaign_freeze();
revoke all on function public.preserve_campaign_freeze() from public,anon,authenticated;
