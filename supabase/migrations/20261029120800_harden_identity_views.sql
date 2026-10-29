-- Hide raw Discord identifiers and the audit log from VIEWER accounts.
-- The roster still shows a linked/not-linked flag through a narrow function.

create function public.member_is_linked(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_allowed() then exists (
      select 1
      from public.member_identities i
      where i.member_id = p_member_id and i.revoked_at is null
    )
    else false
  end;
$$;

create function public.owner_list_identities()
returns table (
  member_id uuid,
  in_game_name text,
  discord_user_id text,
  linked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
begin
  return query
  select i.member_id, m.in_game_name, i.discord_user_id, i.linked_at
  from public.member_identities i
  join public.members m on m.id = i.member_id
  where i.revoked_at is null
  order by m.slot_kind, m.slot_number;
end;
$$;

drop policy member_identities_read on public.member_identities;
create policy member_identities_owner_read on public.member_identities
  for select to authenticated using (public.is_owner());

drop policy audit_events_read on public.audit_events;
create policy audit_events_editor_read on public.audit_events
  for select to authenticated using (public.is_editor());

create or replace view public.roster_overview with (security_invoker = true) as
select
  m.*,
  coalesce(w.weapon_count, 0) as weapon_count,
  public.member_is_linked(m.id) as discord_linked
from public.members m
left join (
  select member_id, count(*)::int as weapon_count
  from public.member_weapons
  group by member_id
) w on w.member_id = m.id;

grant execute on function public.member_is_linked(uuid) to authenticated;
grant execute on function public.owner_list_identities() to authenticated;
