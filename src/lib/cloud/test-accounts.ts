/**
 * For the tests that talk to a real Supabase: make an account the way a
 * person does, including typing in the code from the confirmation email.
 * The local stack delivers nothing; it keeps every message in an inbox with
 * an API (SUPABASE_MAIL_URL, set by scripts/with-local-supabase.mjs).
 */
import type { SupabaseClient, User } from '@supabase/supabase-js'

async function emailedCode(email: string): Promise<string> {
  // Tests run in Node, but the app's own types (rightly) don't know about it.
  const inbox = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env.SUPABASE_MAIL_URL
  if (!inbox) throw new Error('This project confirms email addresses; set SUPABASE_MAIL_URL.')
  for (let tries = 0; tries < 40; tries++) {
    const found = await fetch(`${inbox}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    const { messages } = (await found.json()) as { messages: { ID: string }[] }
    if (messages[0]) {
      const message = await fetch(`${inbox}/api/v1/message/${messages[0].ID}`)
      const { Text } = (await message.json()) as { Text: string }
      const code = /\b\d{6,10}\b/.exec(Text)?.[0]
      if (code) return code
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`no code was emailed to ${email}`)
}

/** Sign up and, where the project asks for it, confirm the address. */
export async function signUpConfirmed(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<User> {
  const { data, error } = await client.auth.signUp({ email, password })
  if (error || !data.user) throw new Error(`sign-up failed: ${error?.message ?? 'no account'}`)
  if (data.session) return data.user

  const confirmed = await client.auth.verifyOtp({
    email,
    token: await emailedCode(email),
    type: 'signup',
  })
  if (confirmed.error || !confirmed.data.session || !confirmed.data.user)
    throw new Error(`confirming failed: ${confirmed.error?.message ?? 'no session'}`)
  return confirmed.data.user
}
