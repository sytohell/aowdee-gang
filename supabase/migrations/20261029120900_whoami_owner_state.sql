-- Expose whether the single OWNER has been bootstrapped. This lets the denied
-- screen show the correct next step without revealing the configured Discord ID.
create or replace function public.whoami()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select private.current_actor() as a
  )
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'discord_user_id', private.discord_id_for(auth.uid()),
    'allowed', (a).member_id is not null,
    'owner_configured', exists (
      select 1 from public.members
      where site_role = 'owner' and state = 'active'
    ),
    'member', case
      when (a).member_id is null then null
      else jsonb_build_object(
        'id', (a).member_id,
        'in_game_name', (a).in_game_name,
        'gang_rank', (a).gang_rank,
        'slot_kind', (a).slot_kind,
        'slot_number', (a).slot_number,
        'site_role', (a).site_role,
        'dues_exempt', (a).dues_exempt
      )
    end
  )
  from actor;
$$;
