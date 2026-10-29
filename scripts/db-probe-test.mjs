import { Client } from 'pg'

console.log('probe start')
process.loadEnvFile('.env.local')
const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})
console.log('connecting')
await client.connect()
console.log('connected')
await client.query('begin')
console.log('begun')
try {
  await client.query(
    `insert into auth.users (
       id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       '10000000-0000-4000-8000-000000000099', 'authenticated', 'authenticated',
       jsonb_build_object('provider', 'discord', 'providers', jsonb_build_array('discord')),
       '{}'::jsonb, now(), now()
     )`,
  )
  console.log('user inserted')
  await client.query(
    `insert into auth.identities (
       user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
     ) values (
       $1, $2,
       jsonb_build_object('sub', $2, 'provider_id', $2, 'provider', 'discord'),
       'discord', now(), now(), now()
     )`,
    ['10000000-0000-4000-8000-000000000099', '999999999999999999'],
  )
  console.log('identity inserted')
} catch (error) {
  console.log('caught', error.message)
  console.log(error.stack)
} finally {
  await client.query('rollback')
  await client.end()
  console.log('done')
}
