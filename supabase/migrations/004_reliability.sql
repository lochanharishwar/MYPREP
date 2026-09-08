create unique index imported_entity_identity on public.entities(brand_id,kind,(coalesce(payload->>'spendId',payload->>'customerId',payload->>'accountId'))) where kind in ('spend','customers','accounts');
create or replace function public.import_entities(p_workspace uuid,p_brand uuid,p_kind text,p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$declare row jsonb;k text;n int:=0;begin
 if p_kind not in ('spend','customers','accounts') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 then raise exception 'Invalid import';end if;
 perform 1 from brands where id=p_brand and workspace_id=p_workspace for update;if not found then raise exception 'Brand not found';end if;
 for row in select * from jsonb_array_elements(p_rows) loop k=coalesce(row->>'spendId',row->>'customerId',row->>'accountId');if k is null or length(k)=0 then raise exception 'Import identity is required';end if;
 update entities set payload=row,updated_at=now() where workspace_id=p_workspace and brand_id=p_brand and kind=p_kind and coalesce(payload->>'spendId',payload->>'customerId',payload->>'accountId')=k;
 if not found then insert into entities(workspace_id,brand_id,kind,payload) values(p_workspace,p_brand,p_kind,row);end if;n=n+1;end loop;return n;end$$;
create or replace function public.budget_usage(p_workspace uuid) returns jsonb language sql stable security definer set search_path=public as $$select jsonb_build_object('reservedUSD',coalesce(sum(amount),0),'estimated',coalesce(bool_or(estimated),false),'periodStart',date_trunc('month',now())) from budget_ledger where workspace_id=p_workspace and created_at>=date_trunc('month',now())$$;
revoke all on function public.import_entities(uuid,uuid,text,jsonb),public.budget_usage(uuid) from public,anon,authenticated;
grant execute on function public.import_entities(uuid,uuid,text,jsonb),public.budget_usage(uuid) to service_role;
