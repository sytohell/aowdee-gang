-- Fix: point ledger rows must record the acting member.
-- Replaces the two point RPCs created in 20261029120200_rpc_members.sql.

create or replace function public.editor_adjust_points(
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
    actor_member_id, subject_member_id, transaction_group_id, idempotency_key, note
  ) values (
    p_account_id, p_delta, v_before, v_after, btrim(p_reason),
    v_actor.member_id, v_subject, v_txn, p_key, nullif(btrim(p_note), '')
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

create or replace function public.editor_reverse_points(
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

  if v_original.correction_of is not null then
    raise exception 'CANNOT_REVERSE_A_CORRECTION' using errcode = '22023';
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
    actor_member_id, subject_member_id, transaction_group_id, idempotency_key, correction_of
  ) values (
    v_account.id, -v_original.delta, v_account.balance, v_after,
    coalesce(nullif(btrim(p_reason), ''), 'reversal'),
    v_actor.member_id, v_original.subject_member_id, v_txn, p_key, p_ledger_id
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
