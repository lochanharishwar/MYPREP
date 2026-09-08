create or replace function public.connection_destination(p_workspace uuid,p_id uuid,p_destination text) returns void language plpgsql security definer set search_path=public as $$
declare c entities;begin
 select * into c from entities where workspace_id=p_workspace and id=p_id and kind='connection' for update;if not found then raise exception 'Connection not found';end if;
 if c.payload->>'destination' is distinct from p_destination and exists(select 1 from entities where workspace_id=p_workspace and kind='approval' and payload->>'accountId'=p_id::text) then raise exception 'This destination is bound to approvals. Connect a separate destination account to change it.';end if;
 update entities set payload=jsonb_set(payload,'{destination}',to_jsonb(p_destination)),updated_at=now() where id=p_id;
end$$;
revoke all on function public.connection_destination(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.connection_destination(uuid,uuid,text) to service_role;
