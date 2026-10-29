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
try {
  const identityColumns = await client.query(`
    select column_name, data_type, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'auth' and table_name in ('users', 'identities')
    order by table_name, ordinal_position
  `)
  console.table(identityColumns.rows)

  const extensions = await client.query(
    `select extname, extversion from pg_extension order by extname`,
  )
  console.log('extensions:', extensions.rows.map((r) => `${r.extname}@${r.extversion}`).join(', '))

  const roles = await client.query(
    `select rolname, rolbypassrls from pg_roles where rolname in ('anon','authenticated','service_role','postgres') order by rolname`,
  )
  console.log('roles:', roles.rows)

  const schemas = await client.query(
    `select nspname from pg_namespace where nspname in ('public','private','supabase_migrations') order by nspname`,
  )
  console.log('schemas:', schemas.rows)
} finally {
  await client.end()
}
