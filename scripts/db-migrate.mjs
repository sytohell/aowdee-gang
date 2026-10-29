import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'

process.loadEnvFile('.env.local')

const connectionString = process.env.SUPABASE_DB_URL
if (!connectionString) {
  console.error('SUPABASE_DB_URL is missing from .env.local')
  process.exit(2)
}

const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

function describeError(error) {
  if (!error || typeof error !== 'object') return String(error)
  const parts = [error.message]
  if (error.detail) parts.push(`detail: ${error.detail}`)
  if (error.hint) parts.push(`hint: ${error.hint}`)
  if (error.position) parts.push(`position: ${error.position}`)
  if (error.code) parts.push(`code: ${error.code}`)
  return parts.join('\n')
}

await client.connect()
try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `)

  await client.query(`select pg_advisory_lock(hashtextextended('aowdee:migrations', 0))`)

  const applied = new Set(
    (
      await client.query('select version from supabase_migrations.schema_migrations')
    ).rows.map((row) => row.version),
  )

  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  let ran = 0
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, '').split('_')
    const name = rest.join('_')

    if (applied.has(version)) {
      console.log(`skip  ${file}`)
      continue
    }

    const sql = await readFile(path.join(migrationsDir, file), 'utf8')
    console.log(`apply ${file}`)

    try {
      await client.query('begin')
      await client.query(sql)
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, statements, name)
         values ($1, $2, $3)`,
        [version, [sql], name],
      )
      await client.query('commit')
      ran += 1
    } catch (error) {
      await client.query('rollback').catch(() => {})
      console.error(`\nMigration failed: ${file}\n${describeError(error)}`)
      process.exitCode = 1
      break
    }
  }

  console.log(ran === 0 ? 'database is up to date' : `applied ${ran} migration(s)`)
} finally {
  await client.query(`select pg_advisory_unlock(hashtextextended('aowdee:migrations', 0))`).catch(() => {})
  await client.end()
}
