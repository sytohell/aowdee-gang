-- Vehicles, announcements and outfit gallery RPCs.

create function public.editor_save_vehicle(
  p_vehicle_id uuid,
  p_name text,
  p_model text,
  p_plate text,
  p_photo_path text,
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
  v_before public.vehicles%rowtype;
  v_after public.vehicles%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_save_vehicle', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'VALIDATION: vehicle name is required' using errcode = '22023';
  end if;

  if p_model is null or char_length(btrim(p_model)) not between 1 and 80 then
    raise exception 'VALIDATION: model is required' using errcode = '22023';
  end if;

  if p_plate is null or char_length(btrim(p_plate)) not between 1 and 24 then
    raise exception 'VALIDATION: plate is required' using errcode = '22023';
  end if;

  if p_photo_path is not null and p_photo_path <> '' then
    if p_photo_path ~ '\.\.' or p_photo_path !~ '^[A-Za-z0-9/_.-]{1,400}$' then
      raise exception 'VALIDATION: invalid photo path' using errcode = '22023';
    end if;
  end if;

  if p_vehicle_id is null then
    insert into public.vehicles (name, model, plate, photo_path, note, created_by)
    values (
      btrim(p_name), btrim(p_model), btrim(p_plate),
      nullif(btrim(p_photo_path), ''), nullif(btrim(p_note), ''), v_actor.member_id
    )
    returning * into v_after;
  else
    select * into v_before from public.vehicles where id = p_vehicle_id for update;
    if not found then
      raise exception 'VEHICLE_NOT_FOUND' using errcode = '22023';
    end if;

    update public.vehicles
    set
      name = btrim(p_name),
      model = btrim(p_model),
      plate = btrim(p_plate),
      photo_path = nullif(btrim(p_photo_path), ''),
      note = nullif(btrim(p_note), '')
    where id = p_vehicle_id
    returning * into v_after;
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'vehicle',
    v_after.id::text,
    case when p_vehicle_id is null then 'vehicle_created' else 'vehicle_updated' end,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('vehicle_id', v_after.id);
  perform private.finish_operation(p_key, 'editor_save_vehicle', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'PLATE_TAKEN' using errcode = '23505';
end;
$$;

create function public.editor_create_vehicle_contract(
  p_vehicle_id uuid,
  p_holder_member_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
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
  v_contract public.vehicle_contracts%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_create_vehicle_contract', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'VALIDATION: end must be after start' using errcode = '22023';
  end if;

  if p_end_at - p_start_at > interval '365 days' then
    raise exception 'VALIDATION: contract cannot exceed 365 days' using errcode = '22023';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if not found or not v_vehicle.is_active then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = '22023';
  end if;

  perform private.require_active_member(p_holder_member_id);

  insert into public.vehicle_contracts (
    vehicle_id, holder_member_id, start_at, end_at, recorded_by, note, idempotency_key
  ) values (
    p_vehicle_id, p_holder_member_id, p_start_at, p_end_at,
    v_actor.member_id, nullif(btrim(p_note), ''), p_key
  )
  returning * into v_contract;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_holder_member_id,
    'vehicle_contract',
    v_contract.id::text,
    'contract_created',
    null,
    to_jsonb(v_contract),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('contract_id', v_contract.id);
  perform private.finish_operation(p_key, 'editor_create_vehicle_contract', v_actor.member_id, v_existing);
  return v_existing;
exception
  when exclusion_violation then
    raise exception 'VEHICLE_ALREADY_HELD' using errcode = '23P01';
end;
$$;

create function public.editor_release_vehicle_contract(
  p_contract_id uuid,
  p_released_at timestamptz,
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
  v_before public.vehicle_contracts%rowtype;
  v_after public.vehicle_contracts%rowtype;
  v_release timestamptz := coalesce(p_released_at, now());
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_release_vehicle_contract', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.vehicle_contracts where id = p_contract_id for update;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_before.released_at is not null then
    raise exception 'CONTRACT_ALREADY_RELEASED' using errcode = '23514';
  end if;

  if v_release < v_before.start_at or v_release > v_before.end_at then
    raise exception 'VALIDATION: release must fall inside the contract' using errcode = '22023';
  end if;

  update public.vehicle_contracts
  set released_at = v_release, note = coalesce(nullif(btrim(p_note), ''), note)
  where id = p_contract_id
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_before.holder_member_id,
    'vehicle_contract',
    p_contract_id::text,
    'contract_released',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('contract_id', p_contract_id, 'released_at', v_release);
  perform private.finish_operation(p_key, 'editor_release_vehicle_contract', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_extend_vehicle_contract(
  p_contract_id uuid,
  p_new_end_at timestamptz,
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
  v_before public.vehicle_contracts%rowtype;
  v_after public.vehicle_contracts%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_extend_vehicle_contract', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.vehicle_contracts where id = p_contract_id for update;

  if not found then
    raise exception 'CONTRACT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_before.released_at is not null then
    raise exception 'CONTRACT_ALREADY_RELEASED' using errcode = '23514';
  end if;

  if p_new_end_at is null or p_new_end_at <= v_before.end_at then
    raise exception 'VALIDATION: new end must be later than the current end' using errcode = '22023';
  end if;

  if p_new_end_at - v_before.start_at > interval '365 days' then
    raise exception 'VALIDATION: contract cannot exceed 365 days' using errcode = '22023';
  end if;

  update public.vehicle_contracts
  set end_at = p_new_end_at, note = coalesce(nullif(btrim(p_note), ''), note)
  where id = p_contract_id
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_before.holder_member_id,
    'vehicle_contract',
    p_contract_id::text,
    'contract_extended',
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('contract_id', p_contract_id, 'end_at', p_new_end_at);
  perform private.finish_operation(p_key, 'editor_extend_vehicle_contract', v_actor.member_id, v_existing);
  return v_existing;
exception
  when exclusion_violation then
    raise exception 'VEHICLE_ALREADY_HELD' using errcode = '23P01';
end;
$$;

create function public.editor_save_announcement(
  p_announcement_id uuid,
  p_title text,
  p_body text,
  p_status public.announcement_status,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_pinned boolean,
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
  v_before public.announcements%rowtype;
  v_after public.announcements%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_save_announcement', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'VALIDATION: title is required' using errcode = '22023';
  end if;

  if p_body is not null and char_length(p_body) > 5000 then
    raise exception 'VALIDATION: description is too long' using errcode = '22023';
  end if;

  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'VALIDATION: end must be after start' using errcode = '22023';
  end if;

  if p_announcement_id is null then
    insert into public.announcements (
      title, body, status, starts_at, ends_at, pinned, created_by, updated_by
    ) values (
      btrim(p_title), coalesce(p_body, ''), p_status, p_starts_at, p_ends_at,
      coalesce(p_pinned, false), v_actor.member_id, v_actor.member_id
    )
    returning * into v_after;
  else
    select * into v_before from public.announcements where id = p_announcement_id for update;

    if not found then
      raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode = '22023';
    end if;

    if v_before.archived_at is not null then
      raise exception 'ANNOUNCEMENT_ARCHIVED' using errcode = '22023';
    end if;

    update public.announcements
    set
      title = btrim(p_title),
      body = coalesce(p_body, ''),
      status = p_status,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      pinned = coalesce(p_pinned, false),
      updated_by = v_actor.member_id
    where id = p_announcement_id
    returning * into v_after;
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'announcement',
    v_after.id::text,
    case when p_announcement_id is null then 'announcement_created' else 'announcement_updated' end,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('announcement_id', v_after.id);
  perform private.finish_operation(p_key, 'editor_save_announcement', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_archive_announcement(
  p_announcement_id uuid,
  p_archived boolean,
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
  v_before public.announcements%rowtype;
  v_after public.announcements%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_archive_announcement', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_before from public.announcements where id = p_announcement_id for update;
  if not found then
    raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode = '22023';
  end if;

  update public.announcements
  set archived_at = case when p_archived then now() else null end,
      updated_by = v_actor.member_id
  where id = p_announcement_id
  returning * into v_after;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'announcement',
    p_announcement_id::text,
    case when p_archived then 'announcement_archived' else 'announcement_restored' end,
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('announcement_id', p_announcement_id, 'archived', p_archived);
  perform private.finish_operation(p_key, 'editor_archive_announcement', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_add_announcement_media(
  p_announcement_id uuid,
  p_storage_path text,
  p_alt_text text,
  p_sort_order smallint,
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
  v_media public.announcement_media%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_add_announcement_media', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_storage_path is null or p_storage_path ~ '\.\.' or p_storage_path !~ '^[A-Za-z0-9/_.-]{1,400}$' then
    raise exception 'VALIDATION: invalid storage path' using errcode = '22023';
  end if;

  perform 1 from public.announcements where id = p_announcement_id and archived_at is null;
  if not found then
    raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.announcement_media (announcement_id, storage_path, alt_text, sort_order)
  values (p_announcement_id, p_storage_path, nullif(btrim(p_alt_text), ''), coalesce(p_sort_order, 0))
  returning * into v_media;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'announcement_media',
    v_media.id::text,
    'announcement_media_added',
    null,
    jsonb_build_object('path', p_storage_path),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('media_id', v_media.id);
  perform private.finish_operation(p_key, 'editor_add_announcement_media', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_remove_announcement_media(
  p_media_id uuid,
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
  v_media public.announcement_media%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_remove_announcement_media', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  delete from public.announcement_media where id = p_media_id returning * into v_media;
  if not found then
    raise exception 'MEDIA_NOT_FOUND' using errcode = '22023';
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'announcement_media',
    p_media_id::text,
    'announcement_media_removed',
    jsonb_build_object('path', v_media.storage_path),
    null,
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('media_id', p_media_id, 'removed', true);
  perform private.finish_operation(p_key, 'editor_remove_announcement_media', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_save_outfit(
  p_outfit_id uuid,
  p_gender public.outfit_gender,
  p_set_name text,
  p_description text,
  p_is_active boolean,
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
  v_before public.outfits%rowtype;
  v_after public.outfits%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_save_outfit', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_set_name is null or char_length(btrim(p_set_name)) not between 1 and 80 then
    raise exception 'VALIDATION: set name is required' using errcode = '22023';
  end if;

  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'VALIDATION: description is too long' using errcode = '22023';
  end if;

  if p_outfit_id is null then
    insert into public.outfits (
      gender, set_name, description, is_active, created_by, updated_by
    ) values (
      p_gender, btrim(p_set_name), coalesce(p_description, ''),
      coalesce(p_is_active, true), v_actor.member_id, v_actor.member_id
    )
    returning * into v_after;
  else
    select * into v_before from public.outfits where id = p_outfit_id for update;
    if not found then
      raise exception 'OUTFIT_NOT_FOUND' using errcode = '22023';
    end if;

    update public.outfits
    set
      gender = p_gender,
      set_name = btrim(p_set_name),
      description = coalesce(p_description, ''),
      is_active = coalesce(p_is_active, is_active),
      updated_by = v_actor.member_id
    where id = p_outfit_id
    returning * into v_after;
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'outfit',
    v_after.id::text,
    case when p_outfit_id is null then 'outfit_created' else 'outfit_updated' end,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('outfit_id', v_after.id);
  perform private.finish_operation(p_key, 'editor_save_outfit', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_add_outfit_code(
  p_outfit_id uuid,
  p_code text,
  p_label text,
  p_sort_order smallint,
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
  v_code public.outfit_codes%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_add_outfit_code', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_code is null or char_length(btrim(p_code)) not between 1 and 60 then
    raise exception 'VALIDATION: outfit code is required' using errcode = '22023';
  end if;

  perform 1 from public.outfits where id = p_outfit_id;
  if not found then
    raise exception 'OUTFIT_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.outfit_codes (outfit_id, code, label, sort_order)
  values (p_outfit_id, btrim(p_code), coalesce(nullif(btrim(p_label), ''), 'ชุด'), coalesce(p_sort_order, 0))
  returning * into v_code;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'outfit_code',
    v_code.id::text,
    'outfit_code_added',
    null,
    jsonb_build_object('outfit_id', p_outfit_id, 'code', btrim(p_code)),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('code_id', v_code.id);
  perform private.finish_operation(p_key, 'editor_add_outfit_code', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'OUTFIT_CODE_TAKEN' using errcode = '23505';
end;
$$;

create function public.editor_remove_outfit_code(
  p_code_id uuid,
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
  v_code public.outfit_codes%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_remove_outfit_code', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  delete from public.outfit_codes where id = p_code_id returning * into v_code;
  if not found then
    raise exception 'OUTFIT_CODE_NOT_FOUND' using errcode = '22023';
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'outfit_code',
    p_code_id::text,
    'outfit_code_removed',
    to_jsonb(v_code),
    null,
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('code_id', p_code_id, 'removed', true);
  perform private.finish_operation(p_key, 'editor_remove_outfit_code', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_add_outfit_media(
  p_outfit_id uuid,
  p_storage_path text,
  p_alt_text text,
  p_sort_order smallint,
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
  v_media public.outfit_media%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_add_outfit_media', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_storage_path is null or p_storage_path ~ '\.\.' or p_storage_path !~ '^[A-Za-z0-9/_.-]{1,400}$' then
    raise exception 'VALIDATION: invalid storage path' using errcode = '22023';
  end if;

  perform 1 from public.outfits where id = p_outfit_id;
  if not found then
    raise exception 'OUTFIT_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.outfit_media (outfit_id, storage_path, alt_text, sort_order)
  values (p_outfit_id, p_storage_path, nullif(btrim(p_alt_text), ''), coalesce(p_sort_order, 0))
  returning * into v_media;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'outfit_media',
    v_media.id::text,
    'outfit_media_added',
    null,
    jsonb_build_object('outfit_id', p_outfit_id, 'path', p_storage_path),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('media_id', v_media.id);
  perform private.finish_operation(p_key, 'editor_add_outfit_media', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_remove_outfit_media(
  p_media_id uuid,
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
  v_media public.outfit_media%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_remove_outfit_media', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  delete from public.outfit_media where id = p_media_id returning * into v_media;
  if not found then
    raise exception 'MEDIA_NOT_FOUND' using errcode = '22023';
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'outfit_media',
    p_media_id::text,
    'outfit_media_removed',
    jsonb_build_object('path', v_media.storage_path),
    null,
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('media_id', p_media_id, 'removed', true);
  perform private.finish_operation(p_key, 'editor_remove_outfit_media', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;
