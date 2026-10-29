-- AOWDEE Gang HQ — core schema
-- All instants are timestamptz (UTC). Bangkok formatting happens in the client.
-- Money and stock are exact integers. No floating point anywhere.

create extension if not exists btree_gist;

create type public.site_role as enum ('owner', 'editor', 'viewer');
create type public.gang_rank as enum ('head', 'deputy', 'member');
create type public.slot_kind as enum ('main', 'reserve');
create type public.member_state as enum ('active', 'archived');
create type public.inventory_class as enum ('general', 'fighting');
create type public.inventory_reason as enum (
  'initial', 'gang_shop', 'story', 'air_drop', 'robbery', 'supply', 'trade', 'gang_activity',
  'correction', 'other'
);
create type public.treasury_category as enum (
  'opening', 'dues', 'item_purchase', 'item_sale', 'story', 'gang_expense',
  'agency_doctor', 'agency_police', 'agency_council', 'agency_mechanic', 'other', 'correction'
);
create type public.point_kind as enum ('gang', 'personal');
create type public.dues_state as enum ('pending', 'partial', 'paid', 'waived');
create type public.announcement_status as enum ('upcoming', 'active', 'completed', 'cancelled');
create type public.outfit_gender as enum ('male', 'female');
create type public.weapon_type as enum (
  'mai', 'gun', 'shark_knife', 'm9_knife', 'dagger', 'machete', 'knuckle'
);

create schema if not exists private;
revoke all on schema private from public;

create table private.app_config (
  key text primary key,
  value text not null
);

-- The only source of the owner bootstrap identity. Written by migration, read by
-- public.claim_owner(). It is never accepted from a browser request.
insert into private.app_config (key, value)
values ('owner_discord_id', '477456950104293378');

create table public.app_settings (
  id boolean primary key default true check (id),
  currency_unit text not null default 'เงินในเกม'
    check (char_length(btrim(currency_unit)) between 1 and 24),
  timezone text not null default 'Asia/Bangkok' check (timezone = 'Asia/Bangkok'),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  in_game_name text not null
    check (char_length(btrim(in_game_name)) between 1 and 60),
  in_game_phone text
    check (in_game_phone is null or char_length(btrim(in_game_phone)) between 1 and 24),
  gang_rank public.gang_rank not null default 'member',
  slot_kind public.slot_kind not null,
  slot_number smallint not null,
  site_role public.site_role not null default 'viewer',
  state public.member_state not null default 'active',
  dues_exempt boolean not null default false,
  joined_at date not null default ((now() at time zone 'Asia/Bangkok')::date),
  archived_at timestamptz,
  archived_reason text check (archived_reason is null or char_length(archived_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_slot_range check (
    (slot_kind = 'main' and slot_number between 1 and 30)
    or (slot_kind = 'reserve' and slot_number between 1 and 5)
  ),
  constraint members_archive_consistency check (
    (state = 'active' and archived_at is null)
    or (state = 'archived' and archived_at is not null)
  )
);

comment on column public.members.slot_kind is
  'Roster slot class. Main has 30 numbered slots, reserve has 5. Reserve members never owe dues.';

create unique index members_active_slot_uidx
  on public.members (slot_kind, slot_number)
  where state = 'active';

create unique index members_single_active_owner_uidx
  on public.members (site_role)
  where site_role = 'owner' and state = 'active';

create index members_state_idx on public.members (state);

create table public.member_identities (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  discord_user_id text not null check (discord_user_id ~ '^[0-9]{15,20}$'),
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) <= 500),
  created_at timestamptz not null default now()
);

create unique index member_identities_active_member_uidx
  on public.member_identities (member_id)
  where revoked_at is null;

create unique index member_identities_active_discord_uidx
  on public.member_identities (discord_user_id)
  where revoked_at is null;

create index member_identities_discord_idx on public.member_identities (discord_user_id);

create table public.member_weapons (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete restrict,
  weapon public.weapon_type not null,
  level smallint not null,
  updated_by uuid references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_weapons_level_range check (
    level >= 0
    and level <= case when weapon in ('mai', 'gun') then 3 else 4 end
  ),
  constraint member_weapons_unique_type unique (member_id, weapon)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  inventory_class public.inventory_class not null,
  unit text not null default 'ชิ้น' check (char_length(btrim(unit)) between 1 and 16),
  is_active boolean not null default true,
  created_by uuid references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_items_name_uidx on public.inventory_items (lower(btrim(name)));

create table public.inventory_balances (
  item_id uuid primary key references public.inventory_items (id) on delete restrict,
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now()
);

create table public.inventory_ledger (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete restrict,
  delta bigint not null check (delta <> 0),
  balance_before bigint not null check (balance_before >= 0),
  balance_after bigint not null check (balance_after >= 0),
  reason public.inventory_reason not null,
  actor_member_id uuid not null references public.members (id) on delete restrict,
  subject_member_id uuid references public.members (id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  transaction_group_id uuid not null default gen_random_uuid(),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  correction_of uuid references public.inventory_ledger (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_ledger_math check (balance_after = balance_before + delta)
);

create unique index inventory_ledger_idempotency_uidx
  on public.inventory_ledger (idempotency_key);
create index inventory_ledger_item_time_idx
  on public.inventory_ledger (item_id, created_at desc);
create index inventory_ledger_group_idx
  on public.inventory_ledger (transaction_group_id);
create index inventory_ledger_subject_idx
  on public.inventory_ledger (subject_member_id, created_at desc);
create unique index inventory_ledger_one_reversal_uidx
  on public.inventory_ledger (correction_of)
  where correction_of is not null;

create table public.treasury_balance (
  id boolean primary key default true check (id),
  balance_minor bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.treasury_balance (id) values (true);

create table public.treasury_ledger (
  id uuid primary key default gen_random_uuid(),
  amount_minor bigint not null check (amount_minor <> 0),
  balance_before bigint not null,
  balance_after bigint not null,
  category public.treasury_category not null,
  actor_member_id uuid not null references public.members (id) on delete restrict,
  subject_member_id uuid references public.members (id) on delete restrict,
  linked_inventory_ledger_id uuid references public.inventory_ledger (id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  transaction_group_id uuid not null default gen_random_uuid(),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  correction_of uuid references public.treasury_ledger (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint treasury_ledger_math check (balance_after = balance_before + amount_minor)
);

create unique index treasury_ledger_idempotency_uidx
  on public.treasury_ledger (idempotency_key);
create index treasury_ledger_time_idx on public.treasury_ledger (created_at desc);
create index treasury_ledger_category_idx on public.treasury_ledger (category, created_at desc);
create index treasury_ledger_group_idx on public.treasury_ledger (transaction_group_id);
create unique index treasury_ledger_one_opening_uidx
  on public.treasury_ledger (category)
  where category = 'opening';
create unique index treasury_ledger_one_reversal_uidx
  on public.treasury_ledger (correction_of)
  where correction_of is not null;
create unique index treasury_ledger_linked_inventory_uidx
  on public.treasury_ledger (linked_inventory_ledger_id)
  where linked_inventory_ledger_id is not null;

create table public.dues_policies (
  id uuid primary key default gen_random_uuid(),
  amount_minor bigint not null check (amount_minor > 0),
  due_weekday smallint not null check (due_weekday between 1 and 7),
  due_time time not null,
  effective_from date not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid not null references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint dues_policies_effective_unique unique (effective_from)
);

comment on column public.dues_policies.due_weekday is
  'ISO weekday: 1 = Monday ... 7 = Sunday, interpreted in Asia/Bangkok.';

create table public.dues_periods (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  due_at timestamptz not null,
  policy_id uuid not null references public.dues_policies (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  policy_snapshot jsonb not null,
  generated_by uuid not null references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint dues_periods_week_start_unique unique (week_start),
  constraint dues_periods_week_check check (
    extract(isodow from week_start) = 1
    and week_end = week_start + 6
  )
);

create table public.dues_obligations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.dues_periods (id) on delete restrict,
  member_id uuid not null references public.members (id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  paid_minor bigint not null default 0
    check (paid_minor >= 0 and paid_minor <= amount_minor),
  due_at timestamptz not null,
  state public.dues_state not null default 'pending',
  snapshot_rank public.gang_rank not null,
  snapshot_slot public.slot_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dues_obligations_period_member_unique unique (period_id, member_id),
  constraint dues_obligations_state_check check (
    (state = 'pending' and paid_minor = 0)
    or (state = 'partial' and paid_minor > 0 and paid_minor < amount_minor)
    or (state = 'paid' and paid_minor = amount_minor)
    or (state = 'waived')
  )
);

create index dues_obligations_open_idx
  on public.dues_obligations (due_at)
  where state in ('pending', 'partial');
create index dues_obligations_member_idx
  on public.dues_obligations (member_id, due_at desc);

create table public.dues_payments (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.dues_obligations (id) on delete restrict,
  amount_minor bigint not null check (amount_minor <> 0),
  treasury_ledger_id uuid not null references public.treasury_ledger (id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  recorded_by uuid not null references public.members (id) on delete restrict,
  paid_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  reversal_of uuid references public.dues_payments (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index dues_payments_treasury_uidx
  on public.dues_payments (treasury_ledger_id);
create unique index dues_payments_idempotency_uidx
  on public.dues_payments (idempotency_key);
create unique index dues_payments_one_reversal_uidx
  on public.dues_payments (reversal_of)
  where reversal_of is not null;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 80),
  plate text not null check (char_length(btrim(plate)) between 1 and 24),
  photo_path text check (photo_path is null or char_length(photo_path) <= 400),
  note text check (note is null or char_length(note) <= 1000),
  is_active boolean not null default true,
  created_by uuid not null references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index vehicles_plate_uidx on public.vehicles (lower(btrim(plate)));

create table public.vehicle_contracts (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  holder_member_id uuid not null references public.members (id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  released_at timestamptz,
  recorded_by uuid not null references public.members (id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  created_at timestamptz not null default now(),
  constraint vehicle_contracts_interval_check check (end_at > start_at),
  constraint vehicle_contracts_release_check check (
    released_at is null
    or (released_at >= start_at and released_at <= end_at)
  ),
  constraint vehicle_contracts_no_overlap exclude using gist (
    vehicle_id with =,
    tstzrange(start_at, coalesce(released_at, end_at), '[)') with &&
  )
);

create unique index vehicle_contracts_idempotency_uidx
  on public.vehicle_contracts (idempotency_key);
create index vehicle_contracts_vehicle_time_idx
  on public.vehicle_contracts (vehicle_id, start_at desc);
create index vehicle_contracts_holder_idx
  on public.vehicle_contracts (holder_member_id, start_at desc);

comment on constraint vehicle_contracts_no_overlap on public.vehicle_contracts is
  'One live contract per vehicle. Early release closes the interval at released_at.';

create table public.point_accounts (
  id uuid primary key default gen_random_uuid(),
  kind public.point_kind not null,
  member_id uuid references public.members (id) on delete restrict,
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint point_accounts_shape check (
    (kind = 'gang' and member_id is null)
    or (kind = 'personal' and member_id is not null)
  )
);

create unique index point_accounts_gang_singleton_uidx
  on public.point_accounts (kind)
  where kind = 'gang';
create unique index point_accounts_personal_member_uidx
  on public.point_accounts (member_id)
  where kind = 'personal';

insert into public.point_accounts (kind) values ('gang');

create table public.point_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.point_accounts (id) on delete restrict,
  delta bigint not null check (delta <> 0),
  balance_before bigint not null check (balance_before >= 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 80),
  actor_member_id uuid not null references public.members (id) on delete restrict,
  subject_member_id uuid references public.members (id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  transaction_group_id uuid not null default gen_random_uuid(),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 100),
  correction_of uuid references public.point_ledger (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint point_ledger_math check (balance_after = balance_before + delta)
);

create unique index point_ledger_idempotency_uidx
  on public.point_ledger (idempotency_key);
create index point_ledger_account_time_idx
  on public.point_ledger (account_id, created_at desc);
create unique index point_ledger_one_reversal_uidx
  on public.point_ledger (correction_of)
  where correction_of is not null;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 5000),
  status public.announcement_status not null default 'upcoming',
  starts_at timestamptz,
  ends_at timestamptz,
  pinned boolean not null default false,
  created_by uuid not null references public.members (id) on delete restrict,
  updated_by uuid not null references public.members (id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_time_check check (
    starts_at is null or ends_at is null or ends_at > starts_at
  )
);

create index announcements_feed_idx
  on public.announcements (pinned desc, starts_at desc nulls last, created_at desc)
  where archived_at is null;

create table public.announcement_media (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  alt_text text check (alt_text is null or char_length(alt_text) <= 200),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create unique index announcement_media_path_uidx
  on public.announcement_media (storage_path);
create index announcement_media_announcement_idx
  on public.announcement_media (announcement_id, sort_order);

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  gender public.outfit_gender not null,
  set_name text not null check (char_length(btrim(set_name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  is_active boolean not null default true,
  created_by uuid not null references public.members (id) on delete restrict,
  updated_by uuid not null references public.members (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outfits_gender_idx on public.outfits (gender, is_active);

create table public.outfit_media (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) between 1 and 400),
  alt_text text check (alt_text is null or char_length(alt_text) <= 200),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create unique index outfit_media_path_uidx on public.outfit_media (storage_path);
create index outfit_media_outfit_idx on public.outfit_media (outfit_id, sort_order);

create table public.outfit_codes (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 60),
  label text not null default 'ชุด' check (char_length(btrim(label)) between 1 and 40),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint outfit_codes_unique unique (outfit_id, code)
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_member_id uuid references public.members (id) on delete restrict,
  actor_discord_user_id text,
  subject_member_id uuid references public.members (id) on delete restrict,
  entity text not null check (char_length(entity) between 1 and 60),
  entity_id text,
  event_type text not null check (char_length(event_type) between 1 and 60),
  before jsonb,
  after jsonb,
  transaction_group_id uuid,
  request_id text,
  created_at timestamptz not null default now()
);

create index audit_events_time_idx on public.audit_events (created_at desc);
create index audit_events_entity_idx on public.audit_events (entity, entity_id);
create index audit_events_actor_idx on public.audit_events (actor_member_id, created_at desc);
create index audit_events_subject_idx on public.audit_events (subject_member_id, created_at desc);

create table public.operation_keys (
  key text primary key check (char_length(key) between 8 and 100),
  operation text not null,
  actor_member_id uuid not null references public.members (id) on delete restrict,
  result jsonb not null,
  created_at timestamptz not null default now()
);
