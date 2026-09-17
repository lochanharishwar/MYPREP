-- Keep credential deletion and account readiness in the same transaction.
create or replace function public.disconnect_connection(p_workspace uuid,p_id uuid,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare c entities; removed integer;
begin
  if not exists(select 1 from memberships where workspace_id=p_workspace and user_id=p_actor and role='owner') then
    raise exception 'Owner required';
  end if;
  select * into c from entities where workspace_id=p_workspace and id=p_id and kind='connection' for update;
  if not found then raise exception 'Connection not found';end if;
  delete from credentials where entity_id=p_id;
  get diagnostics removed = row_count;
  if c.payload->>'status'='expired' and removed=0 then return;end if;
  update entities set payload=payload||jsonb_build_object('status','expired'),updated_at=now() where id=p_id;
  insert into audit_log(workspace_id,brand_id,actor_id,action,resource_id)
    values(p_workspace,c.brand_id,p_actor,'connection.disconnected',p_id);
end $$;
revoke all on function public.disconnect_connection(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.disconnect_connection(uuid,uuid,uuid) to service_role;
