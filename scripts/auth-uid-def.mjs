import { Client } from 'pg'

process.loadEnvFile('.env.local')
const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
})
await client.connect()
const result = await client.query(
  `select pg_get_functiondef('auth.uid'::regproc) as def`,
)
console.log(result.rows[0].def)
await client.end()
