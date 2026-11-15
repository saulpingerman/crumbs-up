import type { SupabaseClient } from '@supabase/supabase-js'
import { cloudConfigured, getClient } from './client'

export type FeedbackKind = 'bug' | 'idea' | 'other'

export interface Feedback {
  kind: FeedbackKind
  message: string
  /** An address to reply to, if they want a reply. */
  contact: string
  /** The screen they came from. */
  screen: string
}

/** Where feedback goes when it can't be sent through the app. */
export const FEEDBACK_EMAIL = 'help@crumbs-up.com'

/** What goes with every report, so a bug can be reproduced. */
function context() {
  return {
    app_version: __APP_VERSION__,
    device: navigator.userAgent.slice(0, 400),
  }
}

export async function writeFeedback(client: SupabaseClient, feedback: Feedback): Promise<void> {
  const { error } = await client.from('feedback').insert({
    kind: feedback.kind,
    message: feedback.message.trim().slice(0, 4000),
    contact: feedback.contact.trim().slice(0, 200) || null,
    screen: feedback.screen.slice(0, 200) || null,
    ...context(),
  })
  if (error) throw new Error(error.message)
}

/** Send it through the app. Rejects when that can't be done, so the caller can offer email. */
export async function sendFeedback(feedback: Feedback): Promise<void> {
  if (!cloudConfigured) throw new Error('No account service in this copy of the app.')
  await writeFeedback(await getClient(), feedback)
}

/** The same report as an email, for when the app can't send it itself. */
export function feedbackEmailLink(feedback: Feedback): string {
  const kind = { bug: 'Bug', idea: 'Idea', other: 'Feedback' }[feedback.kind]
  const { app_version, device } = context()
  const body = [
    feedback.message.trim(),
    '',
    '---',
    `Screen: ${feedback.screen || 'unknown'}`,
    `Version: ${app_version}`,
    `Device: ${device}`,
  ].join('\n')
  return `mailto:${FEEDBACK_EMAIL}?${new URLSearchParams({ subject: `Crumbs Up: ${kind}`, body })
    .toString()
    .replace(/\+/g, '%20')}`
}
