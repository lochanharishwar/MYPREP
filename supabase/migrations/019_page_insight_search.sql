-- Search all stored page findings, not only the currently loaded client page.
-- Callable only by the server after workspace and assigned-brand authorization.
create or replace function public.search_page_insights(
  p_workspace uuid, p_brand uuid, p_query text default '',
  p_limit integer default 25, p_after_at timestamptz default null,
  p_after_id uuid default null
) returns jsonb language plpgsql stable security invoker
set search_path = public as $$
declare result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_query is null or length(p_query) > 200
     or (p_after_at is null) <> (p_after_id is null) then
    raise exception 'Invalid page insight query';
  end if;
  with matching as materialized (
    select id, workspace_id, brand_id, kind, created_at, updated_at,
           payload - 'markdown' - 'html' - 'styles' as payload
    from entities
    where workspace_id = p_workspace and brand_id = p_brand and kind = 'page'
      and (btrim(p_query) = '' or strpos(
        lower(concat_ws(' ', payload->>'url', payload->>'title',
                        payload->>'summary', payload->>'error')),
        lower(btrim(p_query))) > 0)
  ), page as (
    select * from matching
    where p_after_at is null or (created_at,id) < (p_after_at,p_after_id)
    order by created_at desc, id desc limit p_limit + 1
  ), visible as (
    select * from page order by created_at desc, id desc limit p_limit
  ) select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(v) order by created_at desc,id desc) from visible v),'[]'::jsonb),
    'total', (select count(*) from matching),
    'hasMore', (select count(*) > p_limit from page)
  ) into result;
  return result;
end $$;
revoke all on function public.search_page_insights(uuid,uuid,text,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.search_page_insights(uuid,uuid,text,integer,timestamptz,uuid) to service_role;
