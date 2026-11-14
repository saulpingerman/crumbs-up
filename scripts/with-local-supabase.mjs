// Runs a command with the app pointed at the local Supabase stack:
//
//   npx supabase start
//   node scripts/with-local-supabase.mjs npm run dev
//
// It reads the local project's URL and publishable key from the Supabase CLI
// and passes them on as VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
// (Both are the CLI's well-known local defaults, not secrets.)
import { execFileSync, spawn } from 'node:child_process'

let status
try {
  status = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  console.error('The local Supabase stack is not running. Start it with: npx supabase start')
  process.exit(1)
}

const read = (name) => status.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm'))?.[1]
const url = read('API_URL')
const key = read('PUBLISHABLE_KEY') ?? read('ANON_KEY')
if (!url || !key) {
  console.error('Could not read the local Supabase URL and key from `supabase status`.')
  process.exit(1)
}

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.log(`VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}`)
  process.exit(0)
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_PUBLISHABLE_KEY: key,
    // The local stack catches every email it "sends"; tests read them here.
    SUPABASE_MAIL_URL: read('MAILPIT_URL') ?? read('INBUCKET_URL') ?? '',
  },
})
child.on('exit', (code) => process.exit(code ?? 1))
