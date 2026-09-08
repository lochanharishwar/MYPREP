create or replace function public.claim_provider_dispatch(p_id uuid,p_revision int) returns boolean language plpgsql security definer set search_path=public as $$begin
 update entities set payload=payload||jsonb_build_object('dispatchStartedAt',now()),updated_at=now() where id=p_id and kind='schedule' and payload->>'status'='publishing' and (payload->>'revision')::int=p_revision and not(payload ? 'dispatchStartedAt');
 return found;
end$$;
revoke all on function public.claim_provider_dispatch(uuid,int) from public,anon,authenticated;
grant execute on function public.claim_provider_dispatch(uuid,int) to service_role;
