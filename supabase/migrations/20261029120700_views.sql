-- Read models. All views run with the caller's rights (security_invoker), so the
-- table RLS policies still decide what a VIEWER can see.

create view public.vehicle_status with (security_invoker = true) as
select
  v.id,
  v.name,
  v.model,
  v.plate,
  v.photo_path,
  v.note,
  v.is_active,
  live.id as contract_id,
  live.holder_member_id,
  m.in_game_name as holder_name,
  live.start_at,
  live.end_at,
  live.released_at,
  case when live.id is null then 'available' else 'held' end as status,
  case
    when live.id is null then null
    else greatest(0, floor(extract(epoch from (live.end_at - now())) / 60)::bigint)
  end as remaining_minutes
from public.vehicles v
left join lateral (
  select vc.*
  from public.vehicle_contracts vc
  where vc.vehicle_id = v.id
    and vc.released_at is null
    and vc.start_at <= now()
    and vc.end_at > now()
  order by vc.start_at desc
  limit 1
) live on true
left join public.members m on m.id = live.holder_member_id;

create view public.dues_outstanding with (security_invoker = true) as
select
  o.id,
  o.period_id,
  o.member_id,
  m.in_game_name,
  m.slot_kind,
  p.week_start,
  o.amount_minor,
  o.paid_minor,
  (o.amount_minor - o.paid_minor) as unpaid_minor,
  o.due_at,
  o.state,
  (o.state in ('pending', 'partial') and o.due_at < now()) as overdue
from public.dues_obligations o
join public.members m on m.id = o.member_id
join public.dues_periods p on p.id = o.period_id;

create view public.point_overview with (security_invoker = true) as
select
  a.id as account_id,
  a.kind,
  a.member_id,
  m.in_game_name,
  a.balance,
  a.updated_at
from public.point_accounts a
left join public.members m on m.id = a.member_id;

create view public.roster_overview with (security_invoker = true) as
select
  m.*,
  coalesce(w.weapon_count, 0) as weapon_count,
  exists (
    select 1 from public.member_identities i
    where i.member_id = m.id and i.revoked_at is null
  ) as discord_linked
from public.members m
left join (
  select member_id, count(*)::int as weapon_count
  from public.member_weapons
  group by member_id
) w on w.member_id = m.id;

create view public.dashboard_summary with (security_invoker = true) as
select
  (select count(*)::int from public.members where state = 'active' and slot_kind = 'main') as main_filled,
  (select count(*)::int from public.members where state = 'active' and slot_kind = 'reserve') as reserve_filled,
  (select count(*)::int from public.dues_obligations
     where state in ('pending', 'partial') and due_at < now()) as dues_overdue_count,
  (select coalesce(sum(amount_minor - paid_minor), 0)::bigint from public.dues_obligations
     where state in ('pending', 'partial') and due_at < now()) as dues_overdue_minor,
  (select count(*)::int from public.vehicle_contracts
     where released_at is null and start_at <= now() and end_at > now()) as vehicles_held,
  (select count(*)::int from public.vehicle_contracts
     where released_at is null and start_at <= now() and end_at > now()
       and end_at <= now() + interval '24 hours') as vehicles_expiring_24h,
  (select balance from public.point_accounts where kind = 'gang') as gang_points,
  (select count(*)::int from public.announcements where archived_at is null) as announcement_count;

grant select on
  public.vehicle_status,
  public.dues_outstanding,
  public.point_overview,
  public.roster_overview,
  public.dashboard_summary
to authenticated;
