-- Inventory, treasury and weekly dues RPCs. Every stock or cash change writes a
-- ledger row and an audit event in the same transaction.

create function public.editor_upsert_item(
  p_item_id uuid,
  p_name text,
  p_inventory_class public.inventory_class,
  p_unit text,
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
  v_before public.inventory_items%rowtype;
  v_after public.inventory_items%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_upsert_item', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'VALIDATION: item name is required' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.inventory_items (name, inventory_class, unit, created_by)
    values (
      btrim(p_name),
      p_inventory_class,
      coalesce(nullif(btrim(p_unit), ''), 'ชิ้น'),
      v_actor.member_id
    )
    returning * into v_after;

    insert into public.inventory_balances (item_id, quantity)
    values (v_after.id, 0);
  else
    select * into v_before from public.inventory_items where id = p_item_id for update;
    if not found then
      raise exception 'ITEM_NOT_FOUND' using errcode = '22023';
    end if;

    update public.inventory_items
    set
      name = btrim(p_name),
      inventory_class = p_inventory_class,
      unit = coalesce(nullif(btrim(p_unit), ''), unit)
    where id = p_item_id
    returning * into v_after;
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'inventory_item',
    v_after.id::text,
    case when p_item_id is null then 'item_created' else 'item_updated' end,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('item_id', v_after.id);
  perform private.finish_operation(p_key, 'editor_upsert_item', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'ITEM_NAME_TAKEN' using errcode = '23505';
end;
$$;

create function public.owner_set_initial_stock(
  p_item_id uuid,
  p_quantity bigint,
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
  v_balance public.inventory_balances%rowtype;
  v_txn uuid := gen_random_uuid();
  v_ledger_id uuid;
begin
  v_existing := private.begin_operation(p_key, 'owner_set_initial_stock', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_quantity is null or p_quantity < 0 then
    raise exception 'VALIDATION: quantity must be zero or more' using errcode = '22023';
  end if;

  select * into v_balance from public.inventory_balances where item_id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  if exists (select 1 from public.inventory_ledger where item_id = p_item_id) then
    raise exception 'INITIAL_STOCK_LOCKED: use adjustments or reversals' using errcode = '23514';
  end if;

  if p_quantity > 0 then
    update public.inventory_balances
    set quantity = p_quantity
    where item_id = p_item_id;

    insert into public.inventory_ledger (
      item_id, delta, balance_before, balance_after, reason,
      actor_member_id, transaction_group_id, idempotency_key
    ) values (
      p_item_id, p_quantity, 0, p_quantity, 'initial',
      v_actor.member_id, v_txn, p_key
    )
    returning id into v_ledger_id;
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'inventory_balance',
    p_item_id::text,
    'initial_stock_set',
    jsonb_build_object('quantity', v_balance.quantity),
    jsonb_build_object('quantity', p_quantity),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'item_id', p_item_id,
    'quantity', p_quantity,
    'ledger_id', v_ledger_id
  );
  perform private.finish_operation(p_key, 'owner_set_initial_stock', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.inventory_adjust(
  p_item_id uuid,
  p_delta bigint,
  p_reason public.inventory_reason,
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
  v_balance public.inventory_balances%rowtype;
  v_before bigint;
  v_after bigint;
  v_ledger_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'inventory_adjust', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'VALIDATION: delta must not be zero' using errcode = '22023';
  end if;

  if p_reason in ('initial', 'correction') then
    raise exception 'VALIDATION: use the dedicated initial or reversal action' using errcode = '22023';
  end if;

  if p_subject_member_id is not null then
    perform 1 from public.members where id = p_subject_member_id;
    if not found then
      raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
    end if;
  end if;

  select * into v_balance from public.inventory_balances where item_id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  v_before := v_balance.quantity;
  v_after := v_before + p_delta;

  if v_after < 0 then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '23514';
  end if;

  update public.inventory_balances set quantity = v_after where item_id = p_item_id;

  insert into public.inventory_ledger (
    item_id, delta, balance_before, balance_after, reason,
    actor_member_id, subject_member_id, note, transaction_group_id, idempotency_key
  ) values (
    p_item_id, p_delta, v_before, v_after, p_reason,
    v_actor.member_id, p_subject_member_id, nullif(btrim(p_note), ''),
    v_txn, p_key
  )
  returning id into v_ledger_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_subject_member_id,
    'inventory_ledger',
    v_ledger_id::text,
    'stock_adjusted',
    jsonb_build_object('quantity', v_before),
    jsonb_build_object('quantity', v_after, 'delta', p_delta, 'reason', p_reason),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'item_id', p_item_id,
    'ledger_id', v_ledger_id,
    'quantity_before', v_before,
    'quantity_after', v_after
  );
  perform private.finish_operation(p_key, 'inventory_adjust', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.inventory_purchase(
  p_item_id uuid,
  p_quantity bigint,
  p_unit_price_minor bigint,
  p_reason public.inventory_reason,
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
  v_stock public.inventory_balances%rowtype;
  v_cash public.treasury_balance%rowtype;
  v_total bigint;
  v_stock_after bigint;
  v_cash_after bigint;
  v_inventory_ledger_id uuid;
  v_treasury_ledger_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'inventory_purchase', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'VALIDATION: quantity must be between 1 and 1,000,000' using errcode = '22023';
  end if;

  if p_unit_price_minor is null or p_unit_price_minor <= 0 or p_unit_price_minor > 1000000000000 then
    raise exception 'VALIDATION: unit price must be between 1 and 1,000,000,000,000' using errcode = '22023';
  end if;

  if p_reason in ('initial', 'correction') then
    raise exception 'VALIDATION: choose a purchase reason' using errcode = '22023';
  end if;

  v_total := p_quantity * p_unit_price_minor;

  select * into v_stock from public.inventory_balances where item_id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  select * into v_cash from public.treasury_balance where id = true for update;

  if v_cash.balance_minor < v_total then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = '23514';
  end if;

  v_stock_after := v_stock.quantity + p_quantity;
  v_cash_after := v_cash.balance_minor - v_total;

  update public.inventory_balances set quantity = v_stock_after where item_id = p_item_id;
  update public.treasury_balance set balance_minor = v_cash_after where id = true;

  insert into public.inventory_ledger (
    item_id, delta, balance_before, balance_after, reason,
    actor_member_id, subject_member_id, note, transaction_group_id, idempotency_key
  ) values (
    p_item_id, p_quantity, v_stock.quantity, v_stock_after, p_reason,
    v_actor.member_id, p_subject_member_id, nullif(btrim(p_note), ''),
    v_txn, p_key
  )
  returning id into v_inventory_ledger_id;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, subject_member_id, linked_inventory_ledger_id,
    note, transaction_group_id, idempotency_key
  ) values (
    -v_total, v_cash.balance_minor, v_cash_after, 'item_purchase',
    v_actor.member_id, p_subject_member_id, v_inventory_ledger_id,
    nullif(btrim(p_note), ''), v_txn, p_key
  )
  returning id into v_treasury_ledger_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_subject_member_id,
    'inventory_purchase',
    v_inventory_ledger_id::text,
    'item_purchased',
    jsonb_build_object('quantity', v_stock.quantity, 'cash', v_cash.balance_minor),
    jsonb_build_object(
      'quantity', v_stock_after,
      'cash', v_cash_after,
      'total_minor', v_total,
      'treasury_ledger_id', v_treasury_ledger_id
    ),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'inventory_ledger_id', v_inventory_ledger_id,
    'treasury_ledger_id', v_treasury_ledger_id,
    'quantity_after', v_stock_after,
    'cash_after', v_cash_after,
    'total_minor', v_total
  );
  perform private.finish_operation(p_key, 'inventory_purchase', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.inventory_sale(
  p_item_id uuid,
  p_quantity bigint,
  p_unit_price_minor bigint,
  p_reason public.inventory_reason,
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
  v_stock public.inventory_balances%rowtype;
  v_cash public.treasury_balance%rowtype;
  v_total bigint;
  v_stock_after bigint;
  v_cash_after bigint;
  v_inventory_ledger_id uuid;
  v_treasury_ledger_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'inventory_sale', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception 'VALIDATION: quantity must be between 1 and 1,000,000' using errcode = '22023';
  end if;

  if p_unit_price_minor is null or p_unit_price_minor <= 0 or p_unit_price_minor > 1000000000000 then
    raise exception 'VALIDATION: unit price must be between 1 and 1,000,000,000,000' using errcode = '22023';
  end if;

  if p_reason in ('initial', 'correction') then
    raise exception 'VALIDATION: choose a sale reason' using errcode = '22023';
  end if;

  v_total := p_quantity * p_unit_price_minor;

  select * into v_stock from public.inventory_balances where item_id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = '22023';
  end if;

  if v_stock.quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '23514';
  end if;

  select * into v_cash from public.treasury_balance where id = true for update;

  v_stock_after := v_stock.quantity - p_quantity;
  v_cash_after := v_cash.balance_minor + v_total;

  update public.inventory_balances set quantity = v_stock_after where item_id = p_item_id;
  update public.treasury_balance set balance_minor = v_cash_after where id = true;

  insert into public.inventory_ledger (
    item_id, delta, balance_before, balance_after, reason,
    actor_member_id, subject_member_id, note, transaction_group_id, idempotency_key
  ) values (
    p_item_id, -p_quantity, v_stock.quantity, v_stock_after, p_reason,
    v_actor.member_id, p_subject_member_id, nullif(btrim(p_note), ''),
    v_txn, p_key
  )
  returning id into v_inventory_ledger_id;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, subject_member_id, linked_inventory_ledger_id,
    note, transaction_group_id, idempotency_key
  ) values (
    v_total, v_cash.balance_minor, v_cash_after, 'item_sale',
    v_actor.member_id, p_subject_member_id, v_inventory_ledger_id,
    nullif(btrim(p_note), ''), v_txn, p_key
  )
  returning id into v_treasury_ledger_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_subject_member_id,
    'inventory_sale',
    v_inventory_ledger_id::text,
    'item_sold',
    jsonb_build_object('quantity', v_stock.quantity, 'cash', v_cash.balance_minor),
    jsonb_build_object(
      'quantity', v_stock_after,
      'cash', v_cash_after,
      'total_minor', v_total,
      'treasury_ledger_id', v_treasury_ledger_id
    ),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'inventory_ledger_id', v_inventory_ledger_id,
    'treasury_ledger_id', v_treasury_ledger_id,
    'quantity_after', v_stock_after,
    'cash_after', v_cash_after,
    'total_minor', v_total
  );
  perform private.finish_operation(p_key, 'inventory_sale', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.inventory_reverse(
  p_ledger_id uuid,
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
  v_original public.inventory_ledger%rowtype;
  v_linked public.treasury_ledger%rowtype;
  v_stock public.inventory_balances%rowtype;
  v_cash public.treasury_balance%rowtype;
  v_stock_after bigint;
  v_cash_after bigint;
  v_reversal_id uuid;
  v_treasury_reversal_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'inventory_reverse', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_original from public.inventory_ledger where id = p_ledger_id for update;
  if not found then
    raise exception 'LEDGER_ENTRY_NOT_FOUND' using errcode = '22023';
  end if;

  if v_original.correction_of is not null then
    raise exception 'CANNOT_REVERSE_A_CORRECTION' using errcode = '22023';
  end if;

  if exists (select 1 from public.inventory_ledger where correction_of = p_ledger_id) then
    raise exception 'ALREADY_REVERSED' using errcode = '23505';
  end if;

  select * into v_linked from public.treasury_ledger
  where linked_inventory_ledger_id = p_ledger_id;

  select * into v_stock from public.inventory_balances where item_id = v_original.item_id for update;

  v_stock_after := v_stock.quantity - v_original.delta;
  if v_stock_after < 0 then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '23514';
  end if;

  update public.inventory_balances
  set quantity = v_stock_after
  where item_id = v_original.item_id;

  insert into public.inventory_ledger (
    item_id, delta, balance_before, balance_after, reason,
    actor_member_id, subject_member_id, note, transaction_group_id,
    idempotency_key, correction_of
  ) values (
    v_original.item_id, -v_original.delta, v_stock.quantity, v_stock_after, 'correction',
    v_actor.member_id, v_original.subject_member_id,
    coalesce(nullif(btrim(p_note), ''), 'reversal'),
    v_txn, p_key, p_ledger_id
  )
  returning id into v_reversal_id;

  if v_linked.id is not null then
    select * into v_cash from public.treasury_balance where id = true for update;
    v_cash_after := v_cash.balance_minor - v_linked.amount_minor;

    update public.treasury_balance set balance_minor = v_cash_after where id = true;

    insert into public.treasury_ledger (
      amount_minor, balance_before, balance_after, category,
      actor_member_id, subject_member_id, linked_inventory_ledger_id,
      note, transaction_group_id, idempotency_key, correction_of
    ) values (
      -v_linked.amount_minor, v_cash.balance_minor, v_cash_after, 'correction',
      v_actor.member_id, v_original.subject_member_id, v_reversal_id,
      coalesce(nullif(btrim(p_note), ''), 'reversal'),
      v_txn, p_key, v_linked.id
    )
    returning id into v_treasury_reversal_id;
  end if;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_original.subject_member_id,
    'inventory_ledger',
    p_ledger_id::text,
    'stock_reversed',
    jsonb_build_object('quantity', v_stock.quantity, 'ledger', to_jsonb(v_original)),
    jsonb_build_object(
      'quantity', v_stock_after,
      'reversal_ledger_id', v_reversal_id,
      'treasury_reversal_id', v_treasury_reversal_id
    ),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'reversal_ledger_id', v_reversal_id,
    'treasury_reversal_id', v_treasury_reversal_id,
    'quantity_after', v_stock_after
  );
  perform private.finish_operation(p_key, 'inventory_reverse', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.treasury_adjust(
  p_amount_minor bigint,
  p_category public.treasury_category,
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
  v_cash public.treasury_balance%rowtype;
  v_after bigint;
  v_ledger_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'treasury_adjust', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_amount_minor is null or p_amount_minor = 0 then
    raise exception 'VALIDATION: amount must not be zero' using errcode = '22023';
  end if;

  if p_category not in (
    'story', 'gang_expense', 'agency_doctor', 'agency_police',
    'agency_council', 'agency_mechanic', 'other'
  ) then
    raise exception 'VALIDATION: use the dedicated action for this category' using errcode = '22023';
  end if;

  if p_subject_member_id is not null then
    perform 1 from public.members where id = p_subject_member_id;
    if not found then
      raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
    end if;
  end if;

  select * into v_cash from public.treasury_balance where id = true for update;
  v_after := v_cash.balance_minor + p_amount_minor;

  if v_after < 0 then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = '23514';
  end if;

  update public.treasury_balance set balance_minor = v_after where id = true;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, subject_member_id, note, transaction_group_id, idempotency_key
  ) values (
    p_amount_minor, v_cash.balance_minor, v_after, p_category,
    v_actor.member_id, p_subject_member_id, nullif(btrim(p_note), ''),
    v_txn, p_key
  )
  returning id into v_ledger_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    p_subject_member_id,
    'treasury_ledger',
    v_ledger_id::text,
    'cash_adjusted',
    jsonb_build_object('balance', v_cash.balance_minor),
    jsonb_build_object('balance', v_after, 'amount', p_amount_minor, 'category', p_category),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'ledger_id', v_ledger_id,
    'balance_before', v_cash.balance_minor,
    'balance_after', v_after
  );
  perform private.finish_operation(p_key, 'treasury_adjust', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.owner_set_opening_balance(
  p_amount_minor bigint,
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
  v_cash public.treasury_balance%rowtype;
  v_ledger_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'owner_set_opening_balance', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'VALIDATION: opening balance must be more than zero' using errcode = '22023';
  end if;

  select * into v_cash from public.treasury_balance where id = true for update;

  if exists (select 1 from public.treasury_ledger) then
    raise exception 'OPENING_BALANCE_LOCKED' using errcode = '23514';
  end if;

  update public.treasury_balance set balance_minor = p_amount_minor where id = true;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, note, transaction_group_id, idempotency_key
  ) values (
    p_amount_minor, 0, p_amount_minor, 'opening',
    v_actor.member_id, 'opening balance', v_txn, p_key
  )
  returning id into v_ledger_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'treasury_balance',
    'opening',
    'opening_balance_set',
    jsonb_build_object('balance', v_cash.balance_minor),
    jsonb_build_object('balance', p_amount_minor),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('ledger_id', v_ledger_id, 'balance_after', p_amount_minor);
  perform private.finish_operation(p_key, 'owner_set_opening_balance', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.treasury_reverse(
  p_ledger_id uuid,
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
  v_original public.treasury_ledger%rowtype;
  v_cash public.treasury_balance%rowtype;
  v_after bigint;
  v_reversal_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'treasury_reverse', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_original from public.treasury_ledger where id = p_ledger_id for update;
  if not found then
    raise exception 'LEDGER_ENTRY_NOT_FOUND' using errcode = '22023';
  end if;

  if v_original.linked_inventory_ledger_id is not null then
    raise exception 'LINKED_TO_INVENTORY: reverse the inventory entry instead' using errcode = '22023';
  end if;

  if v_original.category in ('dues', 'opening') then
    raise exception 'USE_DEDICATED_REVERSAL' using errcode = '22023';
  end if;

  if v_original.correction_of is not null then
    raise exception 'CANNOT_REVERSE_A_CORRECTION' using errcode = '22023';
  end if;

  if exists (select 1 from public.treasury_ledger where correction_of = p_ledger_id) then
    raise exception 'ALREADY_REVERSED' using errcode = '23505';
  end if;

  select * into v_cash from public.treasury_balance where id = true for update;
  v_after := v_cash.balance_minor - v_original.amount_minor;

  update public.treasury_balance set balance_minor = v_after where id = true;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, subject_member_id, note, transaction_group_id,
    idempotency_key, correction_of
  ) values (
    -v_original.amount_minor, v_cash.balance_minor, v_after, 'correction',
    v_actor.member_id, v_original.subject_member_id,
    coalesce(nullif(btrim(p_note), ''), 'reversal'),
    v_txn, p_key, p_ledger_id
  )
  returning id into v_reversal_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_original.subject_member_id,
    'treasury_ledger',
    p_ledger_id::text,
    'cash_reversed',
    jsonb_build_object('balance', v_cash.balance_minor, 'ledger', to_jsonb(v_original)),
    jsonb_build_object('balance', v_after, 'reversal_ledger_id', v_reversal_id),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'reversal_ledger_id', v_reversal_id,
    'balance_before', v_cash.balance_minor,
    'balance_after', v_after
  );
  perform private.finish_operation(p_key, 'treasury_reverse', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.owner_set_dues_policy(
  p_amount_minor bigint,
  p_due_weekday smallint,
  p_due_time time,
  p_effective_from date,
  p_note text,
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
  v_policy public.dues_policies%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'owner_set_dues_policy', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'VALIDATION: dues amount must be more than zero' using errcode = '22023';
  end if;

  if p_due_weekday is null or p_due_weekday not between 1 and 7 then
    raise exception 'VALIDATION: weekday is out of range' using errcode = '22023';
  end if;

  if p_due_time is null or p_effective_from is null then
    raise exception 'VALIDATION: due time and effective date are required' using errcode = '22023';
  end if;

  insert into public.dues_policies (
    amount_minor, due_weekday, due_time, effective_from, note, created_by
  ) values (
    p_amount_minor, p_due_weekday, p_due_time, p_effective_from,
    nullif(btrim(p_note), ''), v_actor.member_id
  )
  returning * into v_policy;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'dues_policy',
    v_policy.id::text,
    'dues_policy_created',
    null,
    to_jsonb(v_policy),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('policy_id', v_policy.id);
  perform private.finish_operation(p_key, 'owner_set_dues_policy', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'POLICY_EFFECTIVE_DATE_TAKEN' using errcode = '23505';
end;
$$;

create function public.editor_generate_dues_period(
  p_week_start date,
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
  v_existing_period public.dues_periods%rowtype;
  v_policy public.dues_policies%rowtype;
  v_period public.dues_periods%rowtype;
  v_due_at timestamptz;
  v_count integer;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_generate_dues_period', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_week_start is null or extract(isodow from p_week_start) <> 1 then
    raise exception 'VALIDATION: week start must be a Monday' using errcode = '22023';
  end if;

  select * into v_existing_period
  from public.dues_periods
  where week_start = p_week_start;

  if found then
    v_existing := jsonb_build_object(
      'period_id', v_existing_period.id,
      'obligations', 0,
      'already_existed', true
    );
    perform private.finish_operation(p_key, 'editor_generate_dues_period', v_actor.member_id, v_existing);
    return v_existing;
  end if;

  select * into v_policy
  from public.dues_policies
  where effective_from <= p_week_start
  order by effective_from desc
  limit 1;

  if not found then
    raise exception 'NO_DUES_POLICY' using errcode = '22023';
  end if;

  select ((p_week_start + (v_policy.due_weekday - 1))::timestamp + v_policy.due_time)
    at time zone 'Asia/Bangkok'
  into v_due_at;

  insert into public.dues_periods (
    week_start, week_end, due_at, policy_id, amount_minor, policy_snapshot, generated_by
  ) values (
    p_week_start,
    p_week_start + 6,
    v_due_at,
    v_policy.id,
    v_policy.amount_minor,
    to_jsonb(v_policy),
    v_actor.member_id
  )
  returning * into v_period;

  insert into public.dues_obligations (
    period_id, member_id, amount_minor, due_at, snapshot_rank, snapshot_slot
  )
  select
    v_period.id,
    m.id,
    v_policy.amount_minor,
    v_due_at,
    m.gang_rank,
    m.slot_kind
  from public.members m
  where m.state = 'active'
    and m.slot_kind = 'main'
    and m.dues_exempt = false;

  get diagnostics v_count = row_count;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    null,
    'dues_period',
    v_period.id::text,
    'dues_period_generated',
    null,
    jsonb_build_object(
      'week_start', p_week_start,
      'due_at', v_due_at,
      'amount_minor', v_policy.amount_minor,
      'obligations', v_count
    ),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'period_id', v_period.id,
    'obligations', v_count,
    'already_existed', false
  );
  perform private.finish_operation(p_key, 'editor_generate_dues_period', v_actor.member_id, v_existing);
  return v_existing;
exception
  when unique_violation then
    raise exception 'DUES_PERIOD_ALREADY_EXISTS' using errcode = '23505';
end;
$$;

create function public.editor_record_dues_payment(
  p_obligation_id uuid,
  p_amount_minor bigint,
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
  v_obligation public.dues_obligations%rowtype;
  v_cash public.treasury_balance%rowtype;
  v_paid_after bigint;
  v_state public.dues_state;
  v_treasury_ledger_id uuid;
  v_payment_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_record_dues_payment', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  if p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'VALIDATION: payment must be more than zero' using errcode = '22023';
  end if;

  select * into v_obligation
  from public.dues_obligations
  where id = p_obligation_id
  for update;

  if not found then
    raise exception 'DUES_OBLIGATION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_obligation.state in ('paid', 'waived') then
    raise exception 'DUES_ALREADY_SETTLED' using errcode = '23514';
  end if;

  if p_amount_minor > v_obligation.amount_minor - v_obligation.paid_minor then
    raise exception 'PAYMENT_EXCEEDS_BALANCE' using errcode = '23514';
  end if;

  v_paid_after := v_obligation.paid_minor + p_amount_minor;
  v_state := case
    when v_paid_after = v_obligation.amount_minor then 'paid'::public.dues_state
    else 'partial'::public.dues_state
  end;

  select * into v_cash from public.treasury_balance where id = true for update;
  update public.treasury_balance
  set balance_minor = v_cash.balance_minor + p_amount_minor
  where id = true;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, subject_member_id, note, transaction_group_id, idempotency_key
  ) values (
    p_amount_minor, v_cash.balance_minor, v_cash.balance_minor + p_amount_minor, 'dues',
    v_actor.member_id, v_obligation.member_id, nullif(btrim(p_note), ''),
    v_txn, p_key
  )
  returning id into v_treasury_ledger_id;

  insert into public.dues_payments (
    obligation_id, amount_minor, treasury_ledger_id, idempotency_key, recorded_by, note
  ) values (
    p_obligation_id, p_amount_minor, v_treasury_ledger_id, p_key,
    v_actor.member_id, nullif(btrim(p_note), '')
  )
  returning id into v_payment_id;

  update public.dues_obligations
  set paid_minor = v_paid_after, state = v_state
  where id = p_obligation_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_obligation.member_id,
    'dues_obligation',
    p_obligation_id::text,
    'dues_payment_recorded',
    jsonb_build_object('paid_minor', v_obligation.paid_minor, 'cash', v_cash.balance_minor),
    jsonb_build_object(
      'paid_minor', v_paid_after,
      'cash', v_cash.balance_minor + p_amount_minor,
      'state', v_state,
      'payment_id', v_payment_id
    ),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'payment_id', v_payment_id,
    'treasury_ledger_id', v_treasury_ledger_id,
    'paid_minor', v_paid_after,
    'state', v_state
  );
  perform private.finish_operation(p_key, 'editor_record_dues_payment', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.owner_waive_dues(
  p_obligation_id uuid,
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
  v_obligation public.dues_obligations%rowtype;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'owner_waive_dues', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_obligation
  from public.dues_obligations
  where id = p_obligation_id
  for update;

  if not found then
    raise exception 'DUES_OBLIGATION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_obligation.state in ('paid', 'waived') then
    raise exception 'DUES_ALREADY_SETTLED' using errcode = '23514';
  end if;

  update public.dues_obligations
  set state = 'waived'
  where id = p_obligation_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_obligation.member_id,
    'dues_obligation',
    p_obligation_id::text,
    'dues_waived',
    jsonb_build_object('state', v_obligation.state, 'paid_minor', v_obligation.paid_minor),
    jsonb_build_object('state', 'waived', 'reason', nullif(btrim(p_reason), '')),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object('obligation_id', p_obligation_id, 'state', 'waived');
  perform private.finish_operation(p_key, 'owner_waive_dues', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;

create function public.editor_reverse_dues_payment(
  p_payment_id uuid,
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
  v_original public.dues_payments%rowtype;
  v_obligation public.dues_obligations%rowtype;
  v_cash public.treasury_balance%rowtype;
  v_paid_after bigint;
  v_state public.dues_state;
  v_treasury_reversal_id uuid;
  v_reversal_payment_id uuid;
  v_txn uuid := gen_random_uuid();
begin
  v_existing := private.begin_operation(p_key, 'editor_reverse_dues_payment', v_actor.member_id);
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_original from public.dues_payments where id = p_payment_id for update;

  if not found then
    raise exception 'DUES_PAYMENT_NOT_FOUND' using errcode = '22023';
  end if;

  if v_original.reversal_of is not null or v_original.amount_minor < 0 then
    raise exception 'CANNOT_REVERSE_A_REVERSAL' using errcode = '22023';
  end if;

  if exists (select 1 from public.dues_payments where reversal_of = p_payment_id) then
    raise exception 'ALREADY_REVERSED' using errcode = '23505';
  end if;

  select * into v_obligation
  from public.dues_obligations
  where id = v_original.obligation_id
  for update;

  if v_obligation.state = 'waived' then
    raise exception 'DUES_WAIVED' using errcode = '23514';
  end if;

  v_paid_after := v_obligation.paid_minor - v_original.amount_minor;
  if v_paid_after < 0 then
    raise exception 'PAYMENT_REVERSAL_UNDERFLOW' using errcode = '23514';
  end if;

  v_state := case
    when v_paid_after = 0 then 'pending'::public.dues_state
    when v_paid_after = v_obligation.amount_minor then 'paid'::public.dues_state
    else 'partial'::public.dues_state
  end;

  select * into v_cash from public.treasury_balance where id = true for update;

  update public.treasury_balance
  set balance_minor = v_cash.balance_minor - v_original.amount_minor
  where id = true;

  insert into public.treasury_ledger (
    amount_minor, balance_before, balance_after, category,
    actor_member_id, subject_member_id, note, transaction_group_id,
    idempotency_key, correction_of
  ) values (
    -v_original.amount_minor, v_cash.balance_minor, v_cash.balance_minor - v_original.amount_minor,
    'correction', v_actor.member_id, v_obligation.member_id,
    coalesce(nullif(btrim(p_note), ''), 'dues payment reversal'),
    v_txn, p_key, v_original.treasury_ledger_id
  )
  returning id into v_treasury_reversal_id;

  insert into public.dues_payments (
    obligation_id, amount_minor, treasury_ledger_id, idempotency_key,
    recorded_by, note, reversal_of
  ) values (
    p_payment_id, -v_original.amount_minor, v_treasury_reversal_id, p_key,
    v_actor.member_id, coalesce(nullif(btrim(p_note), ''), 'reversal'), p_payment_id
  )
  returning id into v_reversal_payment_id;

  update public.dues_obligations
  set paid_minor = v_paid_after, state = v_state
  where id = p_obligation_id;

  perform private.audit(
    v_actor.member_id,
    v_actor.discord_user_id,
    v_obligation.member_id,
    'dues_payment',
    p_payment_id::text,
    'dues_payment_reversed',
    jsonb_build_object('paid_minor', v_obligation.paid_minor, 'cash', v_cash.balance_minor),
    jsonb_build_object(
      'paid_minor', v_paid_after,
      'cash', v_cash.balance_minor - v_original.amount_minor,
      'state', v_state,
      'reversal_payment_id', v_reversal_payment_id
    ),
    v_txn,
    p_key
  );

  v_existing := jsonb_build_object(
    'payment_id', p_payment_id,
    'reversal_payment_id', v_reversal_payment_id,
    'paid_minor', v_paid_after,
    'state', v_state
  );
  perform private.finish_operation(p_key, 'editor_reverse_dues_payment', v_actor.member_id, v_existing);
  return v_existing;
end;
$$;
