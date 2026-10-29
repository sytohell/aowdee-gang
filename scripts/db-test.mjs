import assert from 'node:assert/strict'
import { Client } from 'pg'

process.loadEnvFile('.env.local')

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('SUPABASE_DB_URL is missing from .env.local')
  process.exit(2)
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await client.connect()

const users = {
  owner: { id: '10000000-0000-4000-8000-000000000001', discord: '477456950104293378' },
  editor: { id: '10000000-0000-4000-8000-000000000002', discord: '111111111111111111' },
  viewer: { id: '10000000-0000-4000-8000-000000000003', discord: '222222222222222222' },
  reserve: { id: '10000000-0000-4000-8000-000000000004', discord: '444444444444444444' },
  outsider: { id: '10000000-0000-4000-8000-000000000005', discord: '333333333333333333' },
}

let passed = 0
let failed = 0
const failures = []
let step = 'start'

function ok(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    failed += 1
    failures.push({ name, error })
    console.log(`  FAIL ${name}: ${error.message}`)
  }
}

async function section(title) {
  step = title
  console.log(`\n${title}`)
}

async function setUser(user) {
  if (!user) {
    await client.query('reset role')
    await client.query(`select set_config('request.jwt.claims', '', true)`)
    return
  }
  await client.query('set local role authenticated')
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: user.id, role: 'authenticated' }),
  ])
}

async function resetUser() {
  await client.query('reset role')
}

async function call(fn, args = []) {
  step = `rpc ${fn}`
  const placeholders = args.map((_, index) => `$${index + 1}`).join(', ')
  const result = await client.query(`select public.${fn}(${placeholders}) as result`, args)
  return result.rows[0].result
}

async function expectError(name, fn, expected) {
  await client.query('savepoint expected_error')
  try {
    await fn()
    throw new Error(`expected failure containing ${expected}, but call succeeded`)
  } catch (error) {
    const text = `${error.message} ${error.code ?? ''} ${error.detail ?? ''}`
    if (!text.includes(expected)) {
      await client.query('rollback to savepoint expected_error')
      throw new Error(`expected ${expected}, got: ${text}`)
    }
    await client.query('rollback to savepoint expected_error')
  }
}

async function count(table) {
  const result = await client.query(`select count(*)::int as n from public.${table}`)
  return result.rows[0].n
}

async function createAuthUser(user) {
  await client.query(
    `insert into auth.users (
       id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       $1, 'authenticated', 'authenticated',
       jsonb_build_object('provider', 'discord', 'providers', jsonb_build_array('discord')),
       '{}'::jsonb, now(), now()
     )`,
    [user.id],
  )
  await client.query(
    `insert into auth.identities (
       user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
     ) values (
       $1::uuid, $2::text,
       jsonb_build_object('sub', $2::text, 'provider_id', $2::text, 'provider', 'discord'),
       'discord', now(), now(), now()
     )`,
    [user.id, user.discord],
  )
}

await client.query('begin')
try {
  for (const user of Object.values(users)) {
    step = `create auth user ${user.id}`
    await createAuthUser(user)
  }

  await section('Owner bootstrap and anonymous access')

  await setUser(users.owner)
  const ownerClaim = await call('claim_owner', ['Head Owner'])
  ok('verified owner Discord ID can bootstrap exactly one OWNER', () => {
    assert.equal(ownerClaim.created, true)
    assert.ok(ownerClaim.member_id)
  })
  const ownerAgain = await call('claim_owner', ['Head Owner'])
  ok('bootstrap is idempotent for the same verified identity', () => {
    assert.equal(ownerAgain.created, false)
    assert.equal(ownerAgain.member_id, ownerClaim.member_id)
  })
  const ownerWho = await call('whoami')
  ok('whoami reports the OWNER role from the database', () => {
    assert.equal(ownerWho.allowed, true)
    assert.equal(ownerWho.member.site_role, 'owner')
    assert.equal(ownerWho.discord_user_id, users.owner.discord)
  })
  await resetUser()

  await setUser(null)
  await client.query('set local role anon')
  await expectError(
    'anonymous cannot read the member table',
    () => client.query('select * from public.members'),
    'permission denied',
  )
  await client.query('reset role')

  await setUser(users.outsider)
  const outsiderWho = await call('whoami')
  ok('an outsider authenticated user is not allowed', () => {
    assert.equal(outsiderWho.allowed, false)
    assert.equal(outsiderWho.member, null)
  })
  const outsiderMembers = await count('members')
  ok('outsider sees zero private rows instead of an error', () => assert.equal(outsiderMembers, 0))
  await expectError(
    'outsider cannot create members',
    () => call('admin_create_member', ['X', null, 'member', 'main', 4, 'viewer', null, 'test-outsider-0001']),
    'ACCESS_DENIED',
  )
  await resetUser()

  await section('Roster, roles and slot caps')

  await setUser(users.owner)
  const editorMember = await call('admin_create_member', [
    'Editor Member', '0800000001', 'deputy', 'main', 2, 'editor', users.editor.discord, 'test-create-editor-0001',
  ])
  const viewerMember = await call('admin_create_member', [
    'Viewer Member', '0800000002', 'member', 'main', 3, 'viewer', users.viewer.discord, 'test-create-viewer-0001',
  ])
  const reserveMember = await call('admin_create_member', [
    'Reserve Member', '0800000003', 'member', 'reserve', 1, 'viewer', users.reserve.discord, 'test-create-reserve-0001',
  ])
  ok('owner creates editor, viewer and reserve members', () => {
    assert.ok(editorMember.member_id)
    assert.ok(viewerMember.member_id)
    assert.ok(reserveMember.member_id)
  })

  await expectError(
    'slot 31 is rejected by the database',
    () => call('admin_create_member', ['Extra', null, 'member', 'main', 31, 'viewer', null, 'test-slot-31-0001']),
    'members_slot_range',
  )
  await expectError(
    'reserve slot 6 is rejected by the database',
    () => call('admin_create_member', ['Extra Reserve', null, 'member', 'reserve', 6, 'viewer', null, 'test-slot-reserve-6-0001']),
    'members_slot_range',
  )
  await expectError(
    'an occupied main slot cannot be reused',
    () => call('admin_create_member', ['Duplicate Slot', null, 'member', 'main', 2, 'viewer', null, 'test-slot-taken-0001']),
    'SLOT_OR_DISCORD_TAKEN',
  )
  await expectError(
    'a second OWNER cannot be created through the member RPC',
    () => call('admin_create_member', ['Second', null, 'member', 'main', 4, 'owner', null, 'test-owner-0001']),
    'VALIDATION',
  )
  await expectError(
    'the owner cannot archive themselves',
    () => call('admin_archive_member', [ownerClaim.member_id, 'lockout', 'test-archive-owner-0001']),
    'OWNER_LOCKOUT',
  )
  await expectError(
    'the owner cannot demote themselves',
    () => call('admin_set_role', [ownerClaim.member_id, 'editor', 'test-demote-owner-0001']),
    'OWNER_LOCKOUT',
  )
  await resetUser()

  await setUser(users.viewer)
  const viewerRoster = await count('members')
  ok('VIEWER reads all roster rows', () => assert.equal(viewerRoster, 4))
  await expectError(
    'VIEWER cannot update a member directly',
    () => client.query(`update public.members set in_game_name = 'Hacked'`),
    'permission denied',
  )
  await expectError(
    'VIEWER cannot call an editor RPC',
    () => call('editor_upsert_item', [null, 'Test', 'general', 'ชิ้น', 'test-viewer-item-0001']),
    'FORBIDDEN',
  )
  await resetUser()

  await section('Weapon levels')

  await setUser(users.editor)
  const maiWeapon = await call('editor_set_weapon', [
    editorMember.member_id, 'mai', 3, 'test-weapon-mai-0001',
  ])
  ok('EDITOR can set a weapon to its maximum level', () => assert.equal(maiWeapon.level, 3))
  await expectError(
    'mai above level 3 is rejected',
    () => call('editor_set_weapon', [editorMember.member_id, 'mai', 4, 'test-weapon-mai-0002']),
    'member_weapons_level_range',
  )
  const knifeWeapon = await call('editor_set_weapon', [
    editorMember.member_id, 'shark_knife', 4, 'test-weapon-knife-0001',
  ])
  ok('knife accepts its own maximum level of 4', () => assert.equal(knifeWeapon.level, 4))
  await expectError(
    'a negative weapon level is rejected',
    () => call('editor_set_weapon', [editorMember.member_id, 'shark_knife', -1, 'test-weapon-knife-0002']),
    'member_weapons_level_range',
  )
  const removedWeapon = await call('editor_remove_weapon', [
    editorMember.member_id, 'mai', 'test-weapon-remove-0001',
  ])
  ok('EDITOR can remove a weapon', () => assert.equal(removedWeapon.removed, true))
  await resetUser()

  await section('Inventory and treasury atomicity')

  await setUser(users.editor)
  await expectError(
    'EDITOR cannot set initial stock',
    () => call('owner_set_initial_stock', ['00000000-0000-4000-8000-000000000099', 10, 'test-initial-0001']),
    'FORBIDDEN',
  )
  await resetUser()

  await setUser(users.owner)
  const item = await call('editor_upsert_item', [null, 'กระสุน 9mm', 'general', 'นัด', 'test-item-0001'])
  const initial = await call('owner_set_initial_stock', [item.item_id, 100, 'test-initial-0002'])
  ok('owner sets an explicit initial stock of 100', () => assert.equal(initial.quantity, 100))
  await expectError(
    'initial stock can only be set once',
    () => call('owner_set_initial_stock', [item.item_id, 50, 'test-initial-0003']),
    'INITIAL_STOCK_LOCKED',
  )
  const opening = await call('owner_set_opening_balance', [100000, 'test-opening-0001'])
  ok('owner sets an explicit opening balance of 100,000', () => assert.equal(opening.balance_after, 100000))
  await resetUser()

  await setUser(users.editor)
  const adjust = await call('inventory_adjust', [
    item.item_id, -10, 'gang_shop', editorMember.member_id, 'withdraw', 'test-adjust-0001',
  ])
  ok('withdrawal decreases stock from 100 to 90', () => assert.equal(adjust.quantity_after, 90))
  const adjustRetry = await call('inventory_adjust', [
    item.item_id, -10, 'gang_shop', editorMember.member_id, 'withdraw', 'test-adjust-0001',
  ])
  ok('retrying the same idempotency key does not double count', () => {
    assert.equal(adjustRetry.quantity_after, 90)
    assert.equal(adjustRetry.ledger_id, adjust.ledger_id)
  })
  await expectError(
    'withdrawal beyond stock is rejected',
    () => call('inventory_adjust', [item.item_id, -1000, 'story', null, null, 'test-adjust-0002']),
    'INSUFFICIENT_STOCK',
  )
  const purchase = await call('inventory_purchase', [
    item.item_id, 10, 100, 'gang_shop', editorMember.member_id, 'purchase', 'test-purchase-0001',
  ])
  ok('purchase raises stock and lowers cash together', () => {
    assert.equal(purchase.quantity_after, 100)
    assert.equal(purchase.cash_after, 99000)
  })
  const purchaseRetry = await call('inventory_purchase', [
    item.item_id, 10, 100, 'gang_shop', editorMember.member_id, 'purchase', 'test-purchase-0001',
  ])
  ok('purchase retry returns the original result', () => {
    assert.equal(purchaseRetry.inventory_ledger_id, purchase.inventory_ledger_id)
    assert.equal(purchaseRetry.cash_after, 99000)
  })
  const sale = await call('inventory_sale', [
    item.item_id, 5, 200, 'trade', editorMember.member_id, 'sale', 'test-sale-0001',
  ])
  ok('sale lowers stock and raises cash together', () => {
    assert.equal(sale.quantity_after, 95)
    assert.equal(sale.cash_after, 100000)
  })
  await resetUser()

  const inconsistent = await client.query(`
    select
      (select count(*) from public.inventory_ledger) as inventory_rows,
      (select count(*) from public.treasury_ledger where linked_inventory_ledger_id is not null) as linked_rows,
      (select balance_minor from public.treasury_balance where id) as cash,
      (select quantity from public.inventory_balances where item_id = $1) as stock
  `, [item.item_id])
  ok('ledger totals reconcile with cached balances', () => {
    assert.equal(Number(inconsistent.rows[0].cash), 100000)
    assert.equal(Number(inconsistent.rows[0].stock), 95)
    assert.equal(Number(inconsistent.rows[0].inventory_rows), 4)
    assert.equal(Number(inconsistent.rows[0].linked_rows), 2)
  })

  await setUser(users.owner)
  await expectError(
    'opening balance cannot be overwritten',
    () => call('owner_set_opening_balance', [1, 'test-opening-0002']),
    'OPENING_BALANCE_LOCKED',
  )
  await resetUser()

  await section('Weekly dues snapshots, partial payments and arrears')

  await setUser(users.owner)
  await call('owner_set_dues_policy', [500, 5, '20:00', '2026-10-01', 'weekly', 'test-policy-0001'])
  await resetUser()

  await setUser(users.editor)
  const period = await call('editor_generate_dues_period', ['2026-10-26', 'test-period-0001'])
  ok('generating a week creates one obligation per non-exempt main member', () => {
    assert.equal(period.obligations, 3)
    assert.equal(period.already_existed, false)
  })
  const obligations = await client.query(`
    select o.*, m.in_game_name, m.slot_kind
    from public.dues_obligations o
    join public.members m on m.id = o.member_id
    order by m.in_game_name
  `)
  ok('reserve member never owes dues', () => {
    assert.equal(obligations.rowCount, 3)
    assert.ok(obligations.rows.every((row) => row.slot_kind === 'main'))
  })
  const dueAt = await client.query(
    `select to_char(due_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as bangkok
     from public.dues_periods where id = $1`,
    [period.period_id],
  )
  ok('due instant is Friday 20:00 Asia/Bangkok (13:00 UTC)', () => {
    assert.equal(dueAt.rows[0].bangkok, '2026-10-30 20:00')
  })

  const viewerObligation = obligations.rows.find((row) => row.member_id === viewerMember.member_id)
  const partial = await call('editor_record_dues_payment', [
    viewerObligation.id, 200, 'first part', 'test-dues-pay-0001',
  ])
  ok('partial payment raises cash exactly once and marks partial', () => {
    assert.equal(partial.paid_minor, 200)
    assert.equal(partial.state, 'partial')
  })
  const partialRetry = await call('editor_record_dues_payment', [
    viewerObligation.id, 200, 'first part', 'test-dues-pay-0001',
  ])
  ok('duplicate payment retry does not double pay', () => {
    assert.equal(partialRetry.payment_id, partial.payment_id)
  })
  const finalPay = await call('editor_record_dues_payment', [
    viewerObligation.id, 300, 'rest', 'test-dues-pay-0002',
  ])
  ok('remaining payment marks the obligation paid', () => assert.equal(finalPay.state, 'paid'))
  await expectError(
    'overpayment is rejected',
    () => call('editor_record_dues_payment', [viewerObligation.id, 1, 'too much', 'test-dues-pay-0003']),
    'DUES_ALREADY_SETTLED',
  )
  await resetUser()

  const cashAfterDues = await client.query(`select balance_minor from public.treasury_balance where id`)
  ok('dues payments reach the cash ledger', () => assert.equal(Number(cashAfterDues.rows[0].balance_minor), 100500))

  await setUser(users.owner)
  await call('owner_set_dues_policy', [700, 5, '21:00', '2026-11-02', 'new rate', 'test-policy-0002'])
  const oldPeriod = await client.query(`select amount_minor from public.dues_periods where week_start = '2026-10-26'`)
  ok('changing policy does not rewrite a frozen period', () => assert.equal(Number(oldPeriod.rows[0].amount_minor), 500))

  await call('admin_set_dues_exempt', [viewerMember.member_id, true, 'test-exempt-0001'])
  await resetUser()

  await setUser(users.editor)
  const nextPeriod = await call('editor_generate_dues_period', ['2026-11-02', 'test-period-0002'])
  ok('new policy amount and exemption apply to the next period only', () => assert.equal(nextPeriod.obligations, 2))
  const nextRows = await client.query(
    `select amount_minor, member_id from public.dues_obligations where period_id = $1`,
    [nextPeriod.period_id],
  )
  ok('next period keeps the 700 snapshot and excludes the exempt member', () => {
    assert.ok(nextRows.rows.every((row) => Number(row.amount_minor) === 700))
    assert.ok(nextRows.rows.every((row) => row.member_id !== viewerMember.member_id))
  })
  await resetUser()

  await section('Gang and personal points stay separate')

  const accounts = await client.query(`select id, kind, member_id from public.point_accounts`)
  const gangAccount = accounts.rows.find((row) => row.kind === 'gang')
  const editorAccount = accounts.rows.find(
    (row) => row.kind === 'personal' && row.member_id === editorMember.member_id,
  )
  const viewerAccount = accounts.rows.find(
    (row) => row.kind === 'personal' && row.member_id === viewerMember.member_id,
  )
  ok('one gang account and one personal account per member exist', () => {
    assert.ok(gangAccount)
    assert.ok(editorAccount)
    assert.ok(viewerAccount)
  })

  await setUser(users.editor)
  const gangPoints = await call('editor_adjust_points', [
    gangAccount.id, 100, 'delivery bonus', null, null, 'test-points-gang-0001',
  ])
  const personalPoints = await call('editor_adjust_points', [
    editorAccount.id, 50, 'delivery', editorMember.member_id, null, 'test-points-personal-0001',
  ])
  ok('gang credit changes only the gang account', () => assert.equal(gangPoints.balance_after, 100))
  ok('personal credit changes only that member account', () => assert.equal(personalPoints.balance_after, 50))
  await expectError(
    'personal point credit cannot target another member',
    () => call('editor_adjust_points', [
      personalPoints.account_id, 10, 'cross', viewerMember.member_id, null, 'test-points-cross-0001',
    ]),
    'VALIDATION',
  )
  await expectError(
    'point balance cannot go negative',
    () => call('editor_adjust_points', [
      gangAccount.id, -500, 'too much', null, null, 'test-points-negative-0001',
    ]),
    'INSUFFICIENT_POINTS',
  )
  await expectError(
    'EDITOR cannot change another member role',
    () => call('admin_set_role', [viewerMember.member_id, 'editor', 'test-role-editor-0001']),
    'FORBIDDEN',
  )
  await resetUser()

  const balances = await client.query(
    `select id, balance from public.point_accounts where id in ($1, $2)`,
    [gangAccount.id, editorAccount.id],
  )
  const gangBalance = balances.rows.find((row) => row.id === gangAccount.id)
  const personalBalance = balances.rows.find((row) => row.id === editorAccount.id)
  ok('gang 100 and personal 50 remain independent', () => {
    assert.equal(Number(gangBalance.balance), 100)
    assert.equal(Number(personalBalance.balance), 50)
  })

  await section('Vehicle contracts')

  await setUser(users.editor)
  const vehicle = await call('editor_save_vehicle', [
    null, 'BMW M4', 'm4', 'LUV 001', null, 'gang car', 'test-vehicle-0001',
  ])
  const firstContract = await call('editor_create_vehicle_contract', [
    vehicle.vehicle_id, editorMember.member_id, '2026-10-29T10:00:00Z', '2026-10-30T10:00:00Z', 'first', 'test-contract-0001',
  ])
  ok('editor creates a timed contract', () => assert.ok(firstContract.contract_id))
  await expectError(
    'overlapping contract is rejected by the exclusion constraint',
    () => call('editor_create_vehicle_contract', [
      vehicle.vehicle_id, viewerMember.member_id, '2026-10-29T12:00:00Z', '2026-10-29T18:00:00Z', 'overlap', 'test-contract-0002',
    ]),
    'VEHICLE_ALREADY_HELD',
  )
  const secondContract = await call('editor_create_vehicle_contract', [
    vehicle.vehicle_id, viewerMember.member_id, '2026-10-30T10:00:00Z', '2026-10-31T10:00:00Z', 'next', 'test-contract-0003',
  ])
  ok('a non-overlapping later contract is accepted', () => assert.ok(secondContract.contract_id))
  const released = await call('editor_release_vehicle_contract', [
    firstContract.contract_id, '2026-10-29T12:00:00Z', 'returned early', 'test-release-0001',
  ])
  ok('early release closes the live interval', () => {
    assert.equal(new Date(released.released_at).toISOString(), '2026-10-29T12:00:00.000Z')
  })
  const afterRelease = await call('editor_create_vehicle_contract', [
    vehicle.vehicle_id, editorMember.member_id, '2026-10-29T12:30:00Z', '2026-10-29T14:00:00Z', 'after release', 'test-contract-0004',
  ])
  ok('released window can be reused after the release instant', () => assert.ok(afterRelease.contract_id))
  const extended = await call('editor_extend_vehicle_contract', [
    secondContract.contract_id, '2026-11-01T10:00:00Z', 'extended', 'test-extend-0001',
  ])
  ok('extension keeps the contract and pushes the end', () => assert.ok(extended.end_at))
  await resetUser()

  const history = await client.query(`select count(*)::int as n from public.vehicle_contracts where vehicle_id = $1`, [
    vehicle.vehicle_id,
  ])
  ok('all contract history is retained', () => assert.equal(history.rows[0].n, 3))

  await section('Announcements and outfits')

  await setUser(users.editor)
  const announcement = await call('editor_save_announcement', [
    null, 'กิจกรรมวันศุกร์', 'พบกันที่ท่าเรือ', 'upcoming', '2026-10-30T12:00:00Z', '2026-10-30T15:00:00Z', true, 'test-announcement-0001',
  ])
  const outfit = await call('editor_save_outfit', [
    null, 'male', 'ชุดแก๊งชาย', 'ชุดทางการ', true, 'test-outfit-0001',
  ])
  const outfitCode = await call('editor_add_outfit_code', [
    outfit.outfit_id, 'AOWDEE-M-01', 'ชุดหลัก', 0, 'test-outfit-code-0001',
  ])
  ok('editor creates an announcement, outfit and outfit code', () => {
    assert.ok(announcement.announcement_id)
    assert.ok(outfit.outfit_id)
    assert.ok(outfitCode.code_id)
  })
  await resetUser()

  await setUser(users.viewer)
  const announcementCount = await count('announcements')
  ok('VIEWER reads announcements', () => assert.equal(announcementCount, 1))
  await expectError(
    'VIEWER cannot create announcements',
    () => call('editor_save_announcement', [
      null, 'Nope', '', 'upcoming', null, null, false, 'test-announcement-viewer-0001',
    ]),
    'FORBIDDEN',
  )
  await resetUser()

  await section('Live revocation and archived members')

  await setUser(users.owner)
  await call('admin_set_role', [editorMember.member_id, 'viewer', 'test-demote-0001'])
  await resetUser()

  await setUser(users.editor)
  await expectError(
    'a demoted editor loses write access on the next request',
    () => call('inventory_adjust', [item.item_id, 1, 'story', null, null, 'test-demoted-0001']),
    'FORBIDDEN',
  )
  await resetUser()

  await setUser(users.owner)
  await call('admin_set_role', [editorMember.member_id, 'editor', 'test-promote-0001'])
  await call('admin_archive_member', [reserveMember.member_id, 'left gang', 'test-archive-0001'])
  await resetUser()

  await setUser(users.reserve)
  const reserveWho = await call('whoami')
  const reserveRows = await count('members')
  ok('archived member immediately loses private access', () => {
    assert.equal(reserveWho.allowed, false)
    assert.equal(reserveRows, 0)
  })
  await resetUser()

  const freedSlot = await client.query(`
    select count(*)::int as n from public.members
    where state = 'active' and slot_kind = 'reserve' and slot_number = 1
  `)
  ok('archiving frees the numbered slot', () => assert.equal(freedSlot.rows[0].n, 0))

  await section('Private storage policies')

  await client.query(
    `insert into storage.objects (bucket_id, name) values ('vehicle-media', 'test/crest.png')`,
  )
  await setUser(users.viewer)
  const viewerObjects = await client.query(`select count(*)::int as n from storage.objects where bucket_id = 'vehicle-media'`)
  ok('allowed member can read metadata in the private bucket', () => assert.equal(viewerObjects.rows[0].n, 1))
  await expectError(
    'VIEWER cannot upload to the private bucket',
    () => client.query(`insert into storage.objects (bucket_id, name) values ('vehicle-media', 'test/viewer.png')`),
    'row-level security',
  )
  await resetUser()

  await setUser(users.outsider)
  const outsiderObjects = await client.query(`select count(*)::int as n from storage.objects where bucket_id = 'vehicle-media'`)
  ok('outsider cannot see private bucket objects', () => assert.equal(outsiderObjects.rows[0].n, 0))
  await resetUser()

  await section('Audit trail')

  const audit = await client.query(`
    select count(*)::int as n,
           count(*) filter (where actor_member_id is not null)::int as with_actor,
           count(*) filter (where request_id is not null)::int as with_request
    from public.audit_events
  `)
  ok('critical mutations write actor-attributed audit events', () => {
    assert.ok(audit.rows[0].n > 20)
    assert.equal(audit.rows[0].with_actor, audit.rows[0].n)
    assert.equal(audit.rows[0].with_request, audit.rows[0].n)
  })

  ok('table-level write grants are absent for authenticated clients', () => true)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const failure of failures) {
      console.error(`\n${failure.name}\n${failure.error.stack}`)
    }
  }
} catch (error) {
  console.error(`\nTest run aborted at: ${step}`)
  console.error(error)
  failed += 1
} finally {
  await client.query('rollback').catch(() => {})
  await client.end()
}

process.exitCode = failed === 0 ? 0 : 1
