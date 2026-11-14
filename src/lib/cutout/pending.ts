import type { ProcessedPhoto } from '@/lib/db/schema'

/**
 * Cut-outs that are still being worked out, by the photo they started from.
 *
 * Finding the cookie takes a few seconds, and a quick rating can be saved in
 * less. Whoever saves the photo can look here and finish the job when the
 * cut-out arrives, instead of the cookie being stuck with the plain photo.
 */
const pending = new WeakMap<ProcessedPhoto, Promise<ProcessedPhoto | null>>()

export function trackCutout(
  source: ProcessedPhoto,
  job: Promise<ProcessedPhoto | null>,
): Promise<ProcessedPhoto | null> {
  // Whoever looks the job up only wants a result; a failure is the
  // starter's to report.
  const settled = job.catch(() => null)
  pending.set(source, settled)
  void settled.then(() => {
    if (pending.get(source) === settled) pending.delete(source)
  })
  return job
}

/** The cut-out in flight for this exact photo, if there is one. */
export function pendingCutout(source: ProcessedPhoto): Promise<ProcessedPhoto | null> | undefined {
  return pending.get(source)
}
