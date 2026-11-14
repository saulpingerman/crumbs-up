import { downloadBlob } from '@/lib/db/backup'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hand an image to the system share sheet where it exists (phones, mostly)
 * and fall back to a plain download everywhere else.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Some browsers claim support and then refuse; fall through to download.
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}

export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cookie'
  )
}
