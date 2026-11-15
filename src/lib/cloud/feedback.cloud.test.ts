/**
 * Feedback against a real database: anyone can send it, nobody can read it
 * back through the app, and nobody can send it as someone else.
 *
 * Skipped unless a Supabase is configured. To run it locally:
 *
 *   npx supabase start
 *   npm run test:cloud
 */
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { writeFeedback } from './feedback'
import { signUpConfirmed } from './test-accounts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const quiet = { auth: { persistSession: false, autoRefreshToken: false } }
const report = { kind: 'bug' as const, message: 'It broke', contact: '', screen: '/map' }

describe.skipIf(!url || !key)('feedback (real Supabase)', () => {
  it('can be sent without an account, and not read back', async () => {
    const stranger = createClient(url!, key!, quiet)
    await expect(writeFeedback(stranger, report)).resolves.toBeUndefined()
    const { data } = await stranger.from('feedback').select('*')
    expect(data ?? []).toEqual([])
  })

  it('is sent as the person signed in, and only as them', async () => {
    const client = createClient(url!, key!, quiet)
    const user = await signUpConfirmed(
      client,
      `feedback-${crypto.randomUUID()}@example.com`,
      'correct horse battery staple',
    )
    await expect(writeFeedback(client, { ...report, kind: 'idea' })).resolves.toBeUndefined()
    // Not readable even by the sender.
    const { data } = await client.from('feedback').select('*')
    expect(data ?? []).toEqual([])
    // Claiming to be someone else is refused.
    const spoof = await client
      .from('feedback')
      .insert({ kind: 'bug', message: 'x', user_id: crypto.randomUUID() })
    expect(spoof.error).not.toBeNull()
    expect(user.id).toBeTruthy()
  })

  it('refuses an empty message or an unknown kind', async () => {
    const stranger = createClient(url!, key!, quiet)
    await expect(writeFeedback(stranger, { ...report, message: '   ' })).rejects.toThrow()
    const odd = await stranger.from('feedback').insert({ kind: 'rant', message: 'x' })
    expect(odd.error).not.toBeNull()
  })
})
