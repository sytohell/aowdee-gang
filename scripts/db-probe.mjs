import { Client } from 'pg'

const password = process.env.DB_PASSWORD
const ref = process.env.SUPABASE_PROJECT_REF ?? 'mvjlhjjkyfkotiyxmhvw'

if (!password) {
  console.error('DB_PASSWORD is not set')
  process.exit(2)
}

const candidates = [
  { name: 'direct', host: `db.${ref}.supabase.co`, port: 5432, user: 'postgres' },
  {
    name: 'session-pooler-aws-0',
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${ref}`,
  },
  {
    name: 'session-pooler-aws-1',
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${ref}`,
  },
]

for (const candidate of candidates) {
  const client = new Client({
    host: candidate.host,
    port: candidate.port,
    user: candidate.user,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  })

  try {
    await client.connect()
    const result = await client.query('select current_database() as db, current_user as role')
    console.log(`OK ${candidate.name} db=${result.rows[0].db} role=${result.rows[0].role}`)
    await client.end()
    process.exit(0)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
    console.log(`FAIL ${candidate.name} ${code} ${message}`)
    try {
      await client.end()
    } catch {
      // connection never opened
    }
  }
}

process.exit(1)
