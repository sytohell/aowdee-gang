-- Authorization helpers, audit, idempotency and owner bootstrap.

create type private.actor as (
  member_id uuid,
  discord_user_id text,
  site_role public.site_role,
  in_game_name text,
  gang_rank public.gang_rank,
  slot_kind public.slot_kind,
  slot_number smallint,
  dues_exempt boolean
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();
create trigger inventory_balances_set_updated_at
  before update on public.inventory_balances
  for each row execute function public.set_updated_at();
create trigger treasury_balance_set_updated_at
  before update on public.treasury_balance
  for each row execute function public.set_updated_at();
create trigger dues_obligations_set_updated_at
  before update on public.dues_obligations
  for each row execute function public.set_updated_at();
create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();
create trigger point_accounts_set_updated_at
  before update on public.point_accounts
  for each row execute function public.set_updated_at();
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();
create trigger outfits_set_updated_at
  before update on public.outfits
  for each row execute function public.set_updated_at();

-- The Discord snowflake attached to the signed-in Supabase user. It comes from
-- auth.identities, written by Supabase only after Discord verified the provider.
-- It is never read from user_metadata, a request body or localStorage.
create function private.discord_id_for(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(i.identity_data ->> 'sub', '')
  from auth.identities i
  where i.user_id = p_user_id
    and i.provider = 'discord'
    and i.identity_data ? 'sub'
  order by i.last_sign_in_at desc nulls last
  limit 1;
$$;

create function private.current_actor()
returns private.actor
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    i.discord_user_id,
    m.site_role,
    m.in_game_name,
    m.gang_rank,
    m.slot_kind,
    m.slot_number,
    m.dues_exempt
  from public.member_identities i
  join public.members m on m.id = i.member_id
  where i.revoked_at is null
    and m.state = 'active'
    and i.discord_user_id = private.discord_id_for(auth.uid())
  limit 1;
$$;

create function private.require_actor()
returns private.actor
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor private.actor;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select * into v_actor from private.current_actor();

  if v_actor.member_id is null then
    raise exception 'ACCESS_DENIED' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

create function private.require_editor()
returns private.actor
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_actor();
begin
  if v_actor.site_role not in ('owner', 'editor') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create function private.require_owner()
returns private.actor
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_actor();
begin
  if v_actor.site_role <> 'owner' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create function private.audit(
  p_actor_member_id uuid,
  p_actor_discord_user_id text,
  p_subject_member_id uuid,
  p_entity text,
  p_entity_id text,
  p_event_type text,
  p_before jsonb,
  p_after jsonb,
  p_transaction_group_id uuid,
  p_request_id text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (
    actor_member_id,
    actor_discord_user_id,
    subject_member_id,
    entity,
    entity_id,
    event_type,
    before,
    after,
    transaction_group_id,
    request_id
  )
  values (
    p_actor_member_id,
    p_actor_discord_user_id,
    p_subject_member_id,
    p_entity,
    p_entity_id,
    p_event_type,
    p_before,
    p_after,
    p_transaction_group_id,
    p_request_id
  );
$$;

-- Serializes retries of the same idempotency key and returns the first result.
create function private.begin_operation(
  p_key text,
  p_operation text,
  p_actor_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_key is null or char_length(p_key) < 8 then
    raise exception 'VALIDATION: idempotency key is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_key, 0));

  select result into v_result
  from public.operation_keys
  where key = p_key;

  if found then
    return v_result;
  end if;

  return null;
end;
$$;

create function private.finish_operation(
  p_key text,
  p_operation text,
  p_actor_member_id uuid,
  p_result jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.operation_keys (key, operation, actor_member_id, result)
  values (p_key, p_operation, p_actor_member_id, p_result);
$$;

create function private.require_active_member(p_member_id uuid)
returns public.members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
begin
  select * into v_member
  from public.members
  where id = p_member_id and state = 'active';

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  return v_member;
end;
$$;

create function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.current_actor()).member_id is not null;
$$;

create function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.current_actor()).site_role in ('owner', 'editor');
$$;

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.current_actor()).site_role = 'owner';
$$;

create function public.whoami()
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

-- Deliberate, verified owner bootstrap. The Discord ID is read from the provider
-- identity and compared with private.app_config. A browser cannot choose it.
create function public.claim_owner(p_in_game_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_discord text;
  v_expected text;
  v_member public.members%rowtype;
  v_slot smallint;
  v_member_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  v_discord := private.discord_id_for(v_uid);
  if v_discord is null then
    raise exception 'DISCORD_IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  select value into v_expected
  from private.app_config
  where key = 'owner_discord_id';

  if v_expected is null or v_discord <> v_expected then
    raise exception 'NOT_BOOTSTRAP_OWNER' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('aowdee:claim_owner', 0));

  select m.* into v_member
  from public.members m
  join public.member_identities i on i.member_id = m.id
  where i.discord_user_id = v_discord
    and i.revoked_at is null
    and m.state = 'active';

  if found then
    return jsonb_build_object('member_id', v_member.id, 'created', false);
  end if;

  if exists (
    select 1 from public.members
    where site_role = 'owner' and state = 'active'
  ) then
    raise exception 'OWNER_ALREADY_EXISTS' using errcode = '23505';
  end if;

  if p_in_game_name is null or char_length(btrim(p_in_game_name)) not between 1 and 60 then
    raise exception 'VALIDATION: in-game name is required' using errcode = '22023';
  end if;

  select min(s) into v_slot
  from generate_series(1, 30) as s
  where not exists (
    select 1 from public.members
    where state = 'active' and slot_kind = 'main' and slot_number = s
  );

  if v_slot is null then
    raise exception 'NO_FREE_MAIN_SLOT' using errcode = '23514';
  end if;

  insert into public.members (
    in_game_name, gang_rank, slot_kind, slot_number, site_role, state
  )
  values (btrim(p_in_game_name), 'head', 'main', v_slot, 'owner', 'active')
  returning id into v_member_id;

  insert into public.member_identities (member_id, discord_user_id)
  values (v_member_id, v_discord);

  insert into public.point_accounts (kind, member_id)
  values ('personal', v_member_id);

  perform private.audit(
    v_member_id,
    v_discord,
    v_member_id,
    'member',
    v_member_id::text,
    'owner_bootstrapped',
    null,
    jsonb_build_object(
      'in_game_name', btrim(p_in_game_name),
      'slot_kind', 'main',
      'slot_number', v_slot,
      'site_role', 'owner'
    ),
    v_txn,
    'claim_owner'
  );

  return jsonb_build_object('member_id', v_member_id, 'created', true);
end;
$$;

-- Internal grant used by tests and by SQL maintenance only.
grant usage on schema private to postgres;
