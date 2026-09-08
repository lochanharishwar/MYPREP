-- Explicit first-party identify events are the only anonymous/customer joins.
create or replace view public.resolved_events with(security_invoker=true) as
 select e.*,coalesce('customer:'||e.customer_id,(select 'customer:'||min(i.customer_id) from journey_events i where i.brand_id=e.brand_id and i.type='identify' and i.source<>'browser' and i.anonymous_id=e.anonymous_id and i.customer_id is not null having count(distinct i.customer_id)=1),'anonymous:'||e.anonymous_id) as journey_id from journey_events e;
create or replace function public.attribution_report(p_brand uuid,p_days int default 30) returns jsonb language sql stable security definer set search_path=public as $$
 with purchases as(select * from resolved_events where brand_id=p_brand and type='purchase'),
 touch as(select p.id purchase_id,p.amount,p.currency,t.channel,t.id,t.occurred_at,row_number() over(partition by p.id order by t.occurred_at,t.id) first_n,row_number() over(partition by p.id order by t.occurred_at desc,t.id desc) last_n,count(*) over(partition by p.id) n from purchases p join resolved_events t on t.brand_id=p.brand_id and t.journey_id=p.journey_id and t.type in ('click','page_view','engaged','video_progress') and t.occurred_at between p.occurred_at-make_interval(days=>greatest(1,least(p_days,365))) and p.occurred_at),
 net as(select p.id,greatest(0,p.amount-coalesce((select sum(r.amount) from journey_events r where r.brand_id=p.brand_id and r.type='refund' and r.order_id=p.order_id and r.currency=p.currency),0)) amount from purchases p),
 allocated as(select t.channel,t.currency,sum(case when first_n=1 then net.amount else 0 end) first_touch,sum(case when last_n=1 then net.amount else 0 end) last_touch,sum(net.amount/t.n) linear from touch t join net on net.id=t.purchase_id group by t.channel,t.currency),
 unassigned as(select 'unattributed' channel,p.currency,sum(net.amount) first_touch,sum(net.amount) last_touch,sum(net.amount) linear from purchases p join net on net.id=p.id where not exists(select 1 from touch t where t.purchase_id=p.id) group by p.currency),
 revenue as(select p.currency,count(*) purchases,count(distinct p.journey_id) customers,sum(net.amount) revenue from purchases p join net on net.id=p.id group by p.currency)
 select jsonb_build_object('channels',coalesce((select jsonb_agg(x) from(select * from allocated union all select * from unassigned)x),'[]'::jsonb),'revenue',coalesce((select jsonb_agg(r) from revenue r),'[]'::jsonb),'lookbackDays',p_days);
$$;
revoke all on function public.attribution_report(uuid,int) from public,anon,authenticated;
grant execute on function public.attribution_report(uuid,int) to service_role;

