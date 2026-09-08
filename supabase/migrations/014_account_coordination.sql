alter table credentials add column version bigint not null default 0;
alter table credentials add column refresh_owner uuid;
alter table credentials add column refresh_until timestamptz;
create or replace function public.claim_token_refresh(p_id uuid,p_owner uuid) returns boolean language plpgsql security definer set search_path=public as $$begin update credentials set refresh_owner=p_owner,refresh_until=now()+interval '2 minutes' where entity_id=p_id and (refresh_until is null or refresh_until<now());return found;end$$;
create or replace function public.finish_token_refresh(p_id uuid,p_owner uuid,p_version bigint,p_encrypted text) returns boolean language plpgsql security definer set search_path=public as $$begin update credentials set encrypted=p_encrypted,version=version+1,refresh_owner=null,refresh_until=null where entity_id=p_id and refresh_owner=p_owner and version=p_version;return found;end$$;
create or replace function public.release_token_refresh(p_id uuid,p_owner uuid) returns void language sql security definer set search_path=public as $$update credentials set refresh_owner=null,refresh_until=null where entity_id=p_id and refresh_owner=p_owner$$;
revoke all on function public.claim_token_refresh(uuid,uuid),public.finish_token_refresh(uuid,uuid,bigint,text),public.release_token_refresh(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_token_refresh(uuid,uuid),public.finish_token_refresh(uuid,uuid,bigint,text),public.release_token_refresh(uuid,uuid) to service_role;
