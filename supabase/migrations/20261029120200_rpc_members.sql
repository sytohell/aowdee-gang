-- Member administration, roster, weapons and point RPCs.

create function public.admin_create_member(
  p_in_game_name text,
  p_in_game_phone text,
  p_gang_rank public.gang_rank,
  p_slot_kind public.slot_kind,
  p_slot_number smallint,
  p_site_role public.site_role,
  p_discord_user_id text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_member public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_create_member', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_site_role = 'owner' then
    raise exception 'VALIDATION: use admin_transfer_owner for OWNER' using errcode = '22023';
  end if;

  if p_in_game_name is null or char_length(btrim(p_in_game_name)) not between 1 and 60 then
    raise exception 'VALIDATION: in-game name is required' using errcode = '22023';
  end if;

  insert into public.members (
    in_game_name, in_game_phone, gang_rank, slot_kind, slot_number, site_role
  )
  values (
    btrim(p_in_game_name),
    nullif(btrim(p_in_game_phone), ''),
    p_gang_rank,
    p_slot_kind,
    p_slot_number,
    p_site_role
  )
  returning * into v_member;

  insert into public.point_accounts (kind, member_id)
  values ('personal', v_member.id);

  if p_discord_user_id is not null and btrim(p_discord_user_id) <> '' then
    insert into public.member_identities (member_id, discord_user_id)
    values (v_member.id, btrim(p_discord_user_id));
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_member.id,
    'member',
    v_member.id::text,
    'member_created',
    null,
    to_jsonb(v_member),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', v_member.id);
  perform private.finish_operation(p_key, 'admin_create_member', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'SLOT_OR_DISCORD_TAKEN' using errcode = '23505';
end;
$$;

create function public.admin_update_member(
  p_member_id uuid,
  p_in_game_name text,
  p_in_game_phone text,
  p_gang_rank public.gang_rank,
  p_slot_kind public.slot_kind,
  p_slot_number smallint,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_editor();
  v_existing jsonb;
  v_before public.members%rowtype;
  v_after public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_update_member', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.members where id = p_member_id for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  if v_before.state <> 'active' then
    raise exception 'MEMBER_ARCHIVED' using errcode = '22023';
  end if;

  if v_before.site_role = 'owner' and v_actor.site_role <> 'owner' then
    raise exception 'FORBIDDEN: editor cannot edit the OWNER profile' using errcode = '42501';
  end if;

  if p_in_game_name is null or char_length(btrim(p_in_game_name)) not between 1 and 60 then
    raise exception 'VALIDATION: in-game name is required' using errcode = '22023';
  end if;

  update public.members
  set
    in_game_name = btrim(p_in_game_name),
    in_game_phone = nullif(btrim(p_in_game_phone), ''),
    gang_rank = p_gang_rank,
    slot_kind = p_slot_kind,
    slot_number = p_slot_number
  where id = p_member_id
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member',
    p_member_id::text,
    'member_updated',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id);
  perform private.finish_operation(p_key, 'admin_update_member', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'SLOT_TAKEN' using errcode = '23505';
end;
$$;

create function public.admin_archive_member(
  p_member_id uuid,
  p_reason text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_before public.members%rowtype;
  v_after public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_archive_member', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.members where id = p_member_id for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  if v_before.site_role = 'owner' then
    raise exception 'OWNER_LOCKOUT: transfer ownership before archiving the owner' using errcode = '42501';
  end if;

  if v_before.state = 'archived' then
    raise exception 'MEMBER_ALREADY_ARCHIVED' using errcode = '22023';
  end if;

  update public.members
  set state = 'archived', archived_at = now(), archived_reason = nullif(btrim(p_reason), '')
  where id = p_member_id
  returning * into v_after;

  update public.member_identities
  set revoked_at = now(), revoked_reason = coalesce(nullif(btrim(p_reason), ''), 'member archived')
  where member_id = p_member_id and revoked_at is null;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member',
    p_member_id::text,
    'member_archived',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id, 'state', 'archived');
  perform private.finish_operation(p_key, 'admin_archive_member', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.admin_link_discord(
  p_member_id uuid,
  p_discord_user_id text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_member public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_link_discord', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_member from public.members where id = p_member_id for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  if v_member.state <> 'active' then
    raise exception 'MEMBER_ARCHIVED' using errcode = '22023';
  end if;

  if v_member.site_role = 'owner' then
    raise exception 'OWNER_IDENTITY_FIXED: the owner Discord identity cannot be relinked here' using errcode = '42501';
  end if;

  if p_discord_user_id is null or btrim(p_discord_user_id) !~ '^[0-9]{15,20}$' then
    raise exception 'VALIDATION: Discord user ID must be 15-20 digits' using errcode = '22023';
  end if;

  update public.member_identities
  set revoked_at = now(), revoked_reason = 'relinked'
  where member_id = p_member_id and revoked_at is null;

  insert into public.member_identities (member_id, discord_user_id)
  values (p_member_id, btrim(p_discord_user_id));

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member_identity',
    p_member_id::text,
    'discord_linked',
    null,
    jsonb_build_object('discord_user_id', btrim(p_discord_user_id)),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id, 'discord_user_id', btrim(p_discord_user_id));
  perform private.finish_operation(p_key, 'admin_link_discord', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'DISCORD_ALREADY_LINKED' using errcode = '23505';
end;
$$;

create function public.admin_unlink_discord(
  p_member_id uuid,
  p_reason text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_member public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_unlink_discord', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_member from public.members where id = p_member_id for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  if v_member.site_role = 'owner' then
    raise exception 'OWNER_LOCKOUT' using errcode = '42501';
  end if;

  update public.member_identities
  set revoked_at = now(), revoked_reason = coalesce(nullif(btrim(p_reason), ''), 'unlinked')
  where member_id = p_member_id and revoked_at is null;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member_identity',
    p_member_id::text,
    'discord_unlinked',
    null,
    jsonb_build_object('reason', nullif(btrim(p_reason), '')),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id, 'linked', false);
  perform private.finish_operation(p_key, 'admin_unlink_discord', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.admin_set_role(
  p_member_id uuid,
  p_site_role public.site_role,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_before public.members%rowtype;
  v_after public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_set_role', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.members where id = p_member_id for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  if v_before.state <> 'active' then
    raise exception 'MEMBER_ARCHIVED' using errcode = '22023';
  end if;

  if p_site_role = 'owner' then
    raise exception 'VALIDATION: use admin_transfer_owner' using errcode = '22023';
  end if;

  if v_before.site_role = 'owner' then
    raise exception 'OWNER_LOCKOUT: use admin_transfer_owner' using errcode = '42501';
  end if;

  update public.members set site_role = p_site_role where id = p_member_id
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member',
    p_member_id::text,
    'role_changed',
    jsonb_build_object('site_role', v_before.site_role),
    jsonb_build_object('site_role', v_after.site_role),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id, 'site_role', p_site_role);
  perform private.finish_operation(p_key, 'admin_set_role', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.admin_transfer_owner(
  p_new_member_id uuid,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_new public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_transfer_owner', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_new_member_id = v_actor.member_id then
    raise exception 'VALIDATION: choose another member' using errcode = '22023';
  end if;

  select * into v_new from public.members where id = p_new_member_id for update;

  if not found or v_new.state <> 'active' then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  if v_new.site_role = 'owner' then
    raise exception 'ALREADY_OWNER' using errcode = '22023';
  end if;

  update public.members
  set site_role = 'editor', gang_rank = 'deputy'
  where id = v_actor.member_id;

  update public.members
  set site_role = 'owner', gang_rank = 'head'
  where id = p_new_member_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_new_member_id,
    'member',
    p_new_member_id::text,
    'owner_transferred',
    jsonb_build_object('from', v_actor.member_id, 'to', p_new_member_id),
    jsonb_build_object('from_role', 'editor', 'to_role', 'owner'),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('owner_member_id', p_new_member_id);
  perform private.finish_operation(p_key, 'admin_transfer_owner', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.admin_set_dues_exempt(
  p_member_id uuid,
  p_exempt boolean,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_owner();
  v_existing jsonb;
  v_before public.members%rowtype;
  v_after public.members%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'admin_set_dues_exempt', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.members where id = p_member_id for update;

  if not found or v_before.state <> 'active' then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  update public.members set dues_exempt = p_exempt where id = p_member_id
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member',
    p_member_id::text,
    'dues_exemption_changed',
    jsonb_build_object('dues_exempt', v_before.dues_exempt),
    jsonb_build_object('dues_exempt', v_after.dues_exempt),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id, 'dues_exempt', p_exempt);
  perform private.finish_operation(p_key, 'admin_set_dues_exempt', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_set_weapon(
  p_member_id uuid,
  p_weapon public.weapon_type,
  p_level smallint,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_editor();
  v_existing jsonb;
  v_before public.member_weapons%rowtype;
  v_after public.member_weapons%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_set_weapon', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  perform 1 from public.members where id = p_member_id and state = 'active';
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;

  select * into v_before from public.member_weapons
  where member_id = p_member_id and weapon = p_weapon;

  insert into public.member_weapons (member_id, weapon, level, updated_by)
  values (p_member_id, p_weapon, p_level, v_actor.member_id)
  on conflict (member_id, weapon) do update
  set level = excluded.level, updated_by = excluded.updated_by
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member_weapon',
    v_after.id::text,
    'weapon_saved',
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('weapon_id', v_after.id, 'level', v_after.level);
  perform private.finish_operation(p_key, 'editor_set_weapon', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_remove_weapon(
  p_member_id uuid,
  p_weapon public.weapon_type,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_editor();
  v_existing jsonb;
  v_before public.member_weapons%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_remove_weapon', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  delete from public.member_weapons
  where member_id = p_member_id and weapon = p_weapon
  returning * into v_before;

  if not found then
    raise exception 'WEAPON_NOT_FOUND' using errcode = '22023';
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_member_id,
    'member_weapon',
    v_before.id::text,
    'weapon_removed',
    to_jsonb(v_before),
    null,
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('member_id', p_member_id, 'weapon', p_weapon, 'removed', true);
  perform private.finish_operation(p_key, 'editor_remove_weapon', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_adjust_points(
  p_account_id uuid,
  p_delta bigint,
  p_reason text,
  p_subject_member_id uuid,
  p_note text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_editor();
  v_existing jsonb;
  v_account public.point_accounts%rowtype;
  v_subject uuid;
  v_before bigint;
  v_after bigint;
  v_ledger_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_adjust_points', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'VALIDATION: point delta must not be zero' using errcode = '22023';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 80 then
    raise exception 'VALIDATION: reason is required' using errcode = '22023';
  end if;

  select * into v_account from public.point_accounts where id = p_account_id for update;

  if not found then
    raise exception 'POINT_ACCOUNT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_account.kind = 'personal' then
    if p_subject_member_id is not null and p_subject_member_id <> v_account.member_id then
      raise exception 'VALIDATION: personal points belong to one member' using errcode = '22023';
    end if;
    v_subject := v_account.member_id;
  else
    if p_subject_member_id is not null then
      perform 1 from public.members where id = p_subject_member_id;
      if not found then
        raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
      end if;
    end if;
    v_subject := p_subject_member_id;
  end if;

  v_before := v_account.balance;
  v_after := v_before + p_delta;

  if v_after < 0 then
    raise exception 'INSUFFICIENT_POINTS' using errcode = '23514';
  end if;

  update public.point_accounts set balance = v_after where id = p_account_id;

  insert into public.point_ledger (
    account_id, delta, balance_before, balance_after, reason,
    subject_member_id, transaction_group_id, idempotency_key, note
  ) values (
    p_account_id, p_delta, v_before, v_after, btrim(p_reason),
    v_subject, v_txn, p_key, nullif(btrim(p_note), '')
  )
  returning id into v_ledger_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_subject,
    'point_account',
    p_account_id::text,
    'points_changed',
    jsonb_build_object('balance', v_before),
    jsonb_build_object('delta', p_delta, 'balance', v_after, 'reason', p_reason),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'account_id', p_account_id,
    'ledger_id', v_ledger_id,
    'delta', p_delta,
    'balance_before', v_before,
    'balance_after', v_after
  );
  perform private.finish_operation(p_key, 'editor_adjust_points', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_reverse_points(
  p_ledger_id uuid,
  p_reason text,
  p_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor private.actor := private.require_editor();
  v_existing jsonb;
  v_original public.point_ledger%rowtype;
  v_account public.point_accounts%rowtype;
  v_after bigint;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_reverse_points', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_original from public.point_ledger where id = p_ledger_id;

  if not found then
    raise exception 'POINT_ENTRY_NOT_FOUND' using errcode = '22023';
  end if;

  if exists (select 1 from public.point_ledger where correction_of = p_ledger_id) then
    raise exception 'ALREADY_REVERSED' using errcode = '23505';
  end if;

  select * into v_account from public.point_accounts where id = v_original.account_id for update;

  v_after := v_account.balance - v_original.delta;
  if v_after < 0 then
    raise exception 'INSUFFICIENT_POINTS' using errcode = '23514';
  end if;

  update public.point_accounts set balance = v_after where id = v_account.id;

  insert into public.point_ledger (
    account_id, delta, balance_before, balance_after, reason,
    subject_member_id, transaction_group_id, idempotency_key, correction_of
  ) values (
    v_account.id, -v_original.delta, v_account.balance, v_after,
    coalesce(nullif(btrim(p_reason), ''), 'reversal'),
    v_original.subject_member_id, v_txn, p_key, p_ledger_id
  );

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_original.subject_member_id,
    'point_ledger',
    p_ledger_id::text,
    'points_reversed',
    jsonb_build_object('balance', v_account.balance, 'ledger', to_jsonb(v_original)),
    jsonb_build_object('balance', v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'account_id', v_account.id,
    'balance_before', v_account.balance,
    'balance_after', v_after
  );
  perform private.finish_operation(p_key, 'editor_reverse_points', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;
