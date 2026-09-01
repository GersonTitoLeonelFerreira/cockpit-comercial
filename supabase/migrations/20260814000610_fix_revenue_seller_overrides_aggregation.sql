-- Include seller overrides even when the day has no won cycle yet.
-- This keeps Gestao de Faturamento and Gestao de Meta on the same source of truth.

create or replace view public.v_revenue_daily_seller
with (security_invoker = true)
as
with cockpit_values as (
  select
    sc.company_id,
    coalesce(sc.won_owner_user_id, sc.owner_user_id) as seller_id,
    coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date
    ) as ref_date,
    sum(coalesce(sc.won_total, 0::numeric)) as cockpit_value
  from public.sales_cycles sc
  where sc.status = 'ganho'
    and coalesce(sc.won_owner_user_id, sc.owner_user_id) is not null
    and sc.won_at is not null
  group by
    sc.company_id,
    coalesce(sc.won_owner_user_id, sc.owner_user_id),
    coalesce(
      sc.revenue_seller_ref_date::date,
      (sc.won_at at time zone 'America/Sao_Paulo')::date
    )
),
seller_overrides as (
  select
    rod.company_id,
    rod.source_id as seller_id,
    rod.ref_date,
    rod.real_value
  from public.revenue_overrides_daily rod
  where rod.source_kind = 'seller'
),
daily_keys as (
  select company_id, seller_id, ref_date
  from cockpit_values
  union
  select company_id, seller_id, ref_date
  from seller_overrides
)
select
  dk.company_id,
  dk.seller_id,
  dk.ref_date,
  coalesce(cv.cockpit_value, 0::numeric) as cockpit_value,
  coalesce(so.real_value, cv.cockpit_value, 0::numeric) as real_value,
  coalesce(so.real_value, cv.cockpit_value, 0::numeric)
    - coalesce(cv.cockpit_value, 0::numeric) as adjustment_value
from daily_keys dk
left join cockpit_values cv
  on cv.company_id = dk.company_id
 and cv.seller_id = dk.seller_id
 and cv.ref_date = dk.ref_date
left join seller_overrides so
  on so.company_id = dk.company_id
 and so.seller_id = dk.seller_id
 and so.ref_date = dk.ref_date
order by dk.company_id, dk.seller_id, dk.ref_date desc;

revoke all privileges on table public.v_revenue_daily_seller from anon;
revoke all privileges on table public.v_revenue_daily_seller from authenticated;
grant select on table public.v_revenue_daily_seller to authenticated;
grant all privileges on table public.v_revenue_daily_seller to service_role;
