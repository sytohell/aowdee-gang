-- Row Level Security, least-privilege grants and private storage.
-- Clients may read authorized tables. All writes go through audited RPCs.

alter table public.app_settings enable row level security;
alter table public.members enable row level security;
alter table public.member_identities enable row level security;
alter table public.member_weapons enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_ledger enable row level security;
alter table public.treasury_balance enable row level security;
alter table public.treasury_ledger enable row level security;
alter table public.dues_policies enable row level security;
alter table public.dues_periods enable row level security;
alter table public.dues_obligations enable row level security;
alter table public.dues_payments enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_contracts enable row level security;
alter table public.point_accounts enable row level security;
alter table public.point_ledger enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_media enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_media enable row level security;
alter table public.outfit_codes enable row level security;
alter table public.audit_events enable row level security;
alter table public.operation_keys enable row level security;

create policy app_settings_read on public.app_settings
  for select to authenticated using (public.is_allowed());
create policy members_read on public.members
  for select to authenticated using (public.is_allowed());
create policy member_identities_read on public.member_identities
  for select to authenticated using (public.is_allowed());
create policy member_weapons_read on public.member_weapons
  for select to authenticated using (public.is_allowed());
create policy inventory_items_read on public.inventory_items
  for select to authenticated using (public.is_allowed());
create policy inventory_balances_read on public.inventory_balances
  for select to authenticated using (public.is_allowed());
create policy inventory_ledger_read on public.inventory_ledger
  for select to authenticated using (public.is_allowed());
create policy treasury_balance_read on public.treasury_balance
  for select to authenticated using (public.is_allowed());
create policy treasury_ledger_read on public.treasury_ledger
  for select to authenticated using (public.is_allowed());
create policy dues_policies_read on public.dues_policies
  for select to authenticated using (public.is_allowed());
create policy dues_periods_read on public.dues_periods
  for select to authenticated using (public.is_allowed());
create policy dues_obligations_read on public.dues_obligations
  for select to authenticated using (public.is_allowed());
create policy dues_payments_read on public.dues_payments
  for select to authenticated using (public.is_allowed());
create policy vehicles_read on public.vehicles
  for select to authenticated using (public.is_allowed());
create policy vehicle_contracts_read on public.vehicle_contracts
  for select to authenticated using (public.is_allowed());
create policy point_accounts_read on public.point_accounts
  for select to authenticated using (public.is_allowed());
create policy point_ledger_read on public.point_ledger
  for select to authenticated using (public.is_allowed());
create policy announcements_read on public.announcements
  for select to authenticated using (public.is_allowed());
create policy announcement_media_read on public.announcement_media
  for select to authenticated using (public.is_allowed());
create policy outfits_read on public.outfits
  for select to authenticated using (public.is_allowed());
create policy outfit_media_read on public.outfit_media
  for select to authenticated using (public.is_allowed());
create policy outfit_codes_read on public.outfit_codes
  for select to authenticated using (public.is_allowed());
create policy audit_events_read on public.audit_events
  for select to authenticated using (public.is_allowed());

-- No client role may write directly. RPCs run as the definer and audit every change.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on
  public.app_settings,
  public.members,
  public.member_identities,
  public.member_weapons,
  public.inventory_items,
  public.inventory_balances,
  public.inventory_ledger,
  public.treasury_balance,
  public.treasury_ledger,
  public.dues_policies,
  public.dues_periods,
  public.dues_obligations,
  public.dues_payments,
  public.vehicles,
  public.vehicle_contracts,
  public.point_accounts,
  public.point_ledger,
  public.announcements,
  public.announcement_media,
  public.outfits,
  public.outfit_media,
  public.outfit_codes,
  public.audit_events
to authenticated;

revoke all on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_allowed() to authenticated;
grant execute on function public.is_editor() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.claim_owner(text) to authenticated;

grant execute on function public.admin_create_member(
  text, text, public.gang_rank, public.slot_kind, smallint, public.site_role, text, text
) to authenticated;
grant execute on function public.admin_update_member(
  uuid, text, text, public.gang_rank, public.slot_kind, smallint, text
) to authenticated;
grant execute on function public.admin_archive_member(uuid, text, text) to authenticated;
grant execute on function public.admin_link_discord(uuid, text, text) to authenticated;
grant execute on function public.admin_unlink_discord(uuid, text, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.site_role, text) to authenticated;
grant execute on function public.admin_transfer_owner(uuid, text) to authenticated;
grant execute on function public.admin_set_dues_exempt(uuid, boolean, text) to authenticated;
grant execute on function public.editor_set_weapon(uuid, public.weapon_type, smallint, text) to authenticated;
grant execute on function public.editor_remove_weapon(uuid, public.weapon_type, text) to authenticated;
grant execute on function public.editor_adjust_points(
  uuid, bigint, text, uuid, text, text
) to authenticated;
grant execute on function public.editor_reverse_points(uuid, text, text) to authenticated;

grant execute on function public.editor_upsert_item(
  uuid, text, public.inventory_class, text, text
) to authenticated;
grant execute on function public.owner_set_initial_stock(uuid, bigint, text) to authenticated;
grant execute on function public.inventory_adjust(
  uuid, bigint, public.inventory_reason, uuid, text, text
) to authenticated;
grant execute on function public.inventory_purchase(
  uuid, bigint, bigint, public.inventory_reason, uuid, text, text
) to authenticated;
grant execute on function public.inventory_sale(
  uuid, bigint, bigint, public.inventory_reason, uuid, text, text
) to authenticated;
grant execute on function public.inventory_reverse(uuid, text, text) to authenticated;
grant execute on function public.treasury_adjust(
  bigint, public.treasury_category, uuid, text, text
) to authenticated;
grant execute on function public.owner_set_opening_balance(bigint, text) to authenticated;
grant execute on function public.treasury_reverse(uuid, text, text) to authenticated;
grant execute on function public.owner_set_dues_policy(
  bigint, smallint, time, date, text, text
) to authenticated;
grant execute on function public.editor_generate_dues_period(date, text) to authenticated;
grant execute on function public.editor_record_dues_payment(uuid, bigint, text, text) to authenticated;
grant execute on function public.owner_waive_dues(uuid, text, text) to authenticated;
grant execute on function public.editor_reverse_dues_payment(uuid, text, text) to authenticated;

grant execute on function public.editor_save_vehicle(
  uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.editor_create_vehicle_contract(
  uuid, uuid, timestamptz, timestamptz, text, text
) to authenticated;
grant execute on function public.editor_release_vehicle_contract(
  uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.editor_extend_vehicle_contract(
  uuid, timestamptz, text, text
) to authenticated;
grant execute on function public.editor_save_announcement(
  uuid, text, text, public.announcement_status, timestamptz, timestamptz, boolean, text
) to authenticated;
grant execute on function public.editor_archive_announcement(uuid, boolean, text) to authenticated;
grant execute on function public.editor_add_announcement_media(
  uuid, text, text, smallint, text
) to authenticated;
grant execute on function public.editor_remove_announcement_media(uuid, text) to authenticated;
grant execute on function public.editor_save_outfit(
  uuid, public.outfit_gender, text, text, boolean, text
) to authenticated;
grant execute on function public.editor_add_outfit_code(uuid, text, text, smallint, text) to authenticated;
grant execute on function public.editor_remove_outfit_code(uuid, text) to authenticated;
grant execute on function public.editor_add_outfit_media(uuid, text, text, smallint, text) to authenticated;
grant execute on function public.editor_remove_outfit_media(uuid, text) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;

-- Private buckets. Objects are served only through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('vehicle-media', 'vehicle-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('activity-media', 'activity-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('outfit-media', 'outfit-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy aowdee_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id in ('vehicle-media', 'activity-media', 'outfit-media')
    and public.is_allowed()
  );

create policy aowdee_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('vehicle-media', 'activity-media', 'outfit-media')
    and public.is_editor()
  );

create policy aowdee_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id in ('vehicle-media', 'activity-media', 'outfit-media')
    and public.is_editor()
  )
  with check (
    bucket_id in ('vehicle-media', 'activity-media', 'outfit-media')
    and public.is_editor()
  );

create policy aowdee_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('vehicle-media', 'activity-media', 'outfit-media')
    and public.is_editor()
  );
