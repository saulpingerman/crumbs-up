import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate'
import { z } from 'zod'
import { CATEGORIES, overallScore, type OverallPrecision, type Weights } from '@/lib/rubric'
import { todayIso } from '@/lib/format'
import { stateName } from '@/lib/states'
import { db, type CrumbsDb } from './db'
import { cookieSchema, type CookieRecord, type StoredImage } from './schema'

/**
 * A backup is a plain .zip:
 *
 *   crumbs-up.json            every cookie and its answers
 *   photos/<id>.jpg           the picture shown for the cookie
 *   thumbs/<id>.jpg           its thumbnail
 *   originals/<id>.jpg        the untouched photo, when the picture is a cut-out
 *   cookies.csv               the scores as a spreadsheet, for humans
 */
export const BACKUP_FORMAT = 'crumbs-up-backup'
export const BACKUP_VERSION = 1

const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int().positive(),
  exportedAt: z.string(),
  cookies: z.array(z.unknown()),
  images: z
    .record(
      z.string(),
      z.object({
        mime: z.string(),
        width: z.number(),
        height: z.number(),
        thumbWidth: z.number(),
        thumbHeight: z.number(),
        original: z.object({ mime: z.string(), width: z.number(), height: z.number() }).optional(),
      }),
    )
    .default({}),
})

type Manifest = z.infer<typeof manifestSchema>

function zipAsync(files: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) =>
    // Photos are already compressed JPEGs, so just store them.
    zip(files, { level: 0 }, (err, data) => (err ? reject(err) : resolve(data))),
  )
}

function unzipAsync(data: Uint8Array): Promise<Unzipped> {
  return new Promise((resolve, reject) =>
    unzip(data, (err, files) => (err ? reject(err) : resolve(files))),
  )
}

function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function toCsv(
  cookies: CookieRecord[],
  weights: Weights,
  precision: OverallPrecision,
): string {
  const header = [
    'Date',
    'Cookie',
    'Bakery',
    'City',
    'State',
    'Taste',
    'Texture',
    'Appearance',
    'Overall',
    'Price',
    'Notes',
  ]
  const rows = cookies.map((c) =>
    [
      c.eatenOn,
      c.cookieType,
      c.bakery,
      c.city,
      stateName(c.state),
      ...CATEGORIES.map((cat) => c.scores[cat]),
      overallScore(c.scores, weights, precision),
      c.price,
      c.notes,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...rows].join('\r\n')
}

export interface ExportOptions {
  weights: Weights
  precision: OverallPrecision
  /** Leave the demo cookies out of the file. */
  skipSamples?: boolean
}

export async function exportBackup(
  options: ExportOptions,
  database: CrumbsDb = db,
): Promise<{ blob: Blob; filename: string; count: number }> {
  const all = await database.cookies.toArray()
  const cookies = (options.skipSamples ? all.filter((c) => !c.sample) : all).sort((a, b) =>
    a.eatenOn.localeCompare(b.eatenOn),
  )
  const ids = cookies.map((c) => c.id)
  const [photos, thumbs, originals] = await Promise.all([
    database.photos.bulkGet(ids),
    database.thumbs.bulkGet(ids),
    database.originals.bulkGet(ids),
  ])

  const files: Zippable = {}
  const images: Manifest['images'] = {}
  ids.forEach((id, i) => {
    const photo = photos[i]
    const thumb = thumbs[i]
    if (!photo || !thumb) return
    const original = originals[i]
    files[`photos/${id}.jpg`] = new Uint8Array(photo.data)
    files[`thumbs/${id}.jpg`] = new Uint8Array(thumb.data)
    if (original) files[`originals/${id}.jpg`] = new Uint8Array(original.data)
    images[id] = {
      mime: photo.mime,
      width: photo.width,
      height: photo.height,
      thumbWidth: thumb.width,
      thumbHeight: thumb.height,
      ...(original
        ? { original: { mime: original.mime, width: original.width, height: original.height } }
        : {}),
    }
  })

  const exportedAt = new Date().toISOString()
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt,
    cookies,
    images,
  }
  files['crumbs-up.json'] = strToU8(JSON.stringify(manifest, null, 2))
  files['cookies.csv'] = strToU8(toCsv(cookies, options.weights, options.precision))

  const zipped = await zipAsync(files)
  return {
    blob: new Blob([zipped as BlobPart], { type: 'application/zip' }),
    filename: `crumbs-up-backup-${todayIso()}.zip`,
    count: cookies.length,
  }
}

export interface ImportResult {
  added: number
  updated: number
  /** Already here and at least as new as the copy in the file. */
  unchanged: number
  /** Records in the file that could not be read. */
  skipped: number
}

export class BackupError extends Error {}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Merge a backup into this device. Cookies are matched by id and the most
 * recently edited copy wins, so importing the same file twice is harmless.
 */
export async function importBackup(file: Blob, database: CrumbsDb = db): Promise<ImportResult> {
  let files: Unzipped
  try {
    files = await unzipAsync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new BackupError('That file isn’t a Crumbs Up backup (.zip).')
  }
  // A backup that was unzipped and zipped again (Safari on a Mac expands
  // downloads by itself) ends up one folder deep, so look for the manifest
  // wherever it is and read everything else relative to it.
  const manifestPath = Object.keys(files)
    .filter((path) => !path.startsWith('__MACOSX/'))
    .sort((a, b) => a.length - b.length)
    .find((path) => path === 'crumbs-up.json' || path.endsWith('/crumbs-up.json'))
  const manifestFile = manifestPath ? files[manifestPath] : undefined
  if (!manifestPath || !manifestFile) {
    throw new BackupError('That zip doesn’t contain a Crumbs Up backup.')
  }
  const root = manifestPath.slice(0, -'crumbs-up.json'.length)

  let manifest: Manifest
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestFile)))
  } catch {
    throw new BackupError('The backup file is damaged or from an unknown format.')
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new BackupError(
      'This backup was made by a newer version of Crumbs Up. Update the app first.',
    )
  }

  const result: ImportResult = { added: 0, updated: 0, unchanged: 0, skipped: 0 }

  const tables = [database.cookies, database.photos, database.thumbs, database.originals]
  await database.transaction('rw', tables, async () => {
    for (const raw of manifest.cookies) {
      const parsed = cookieSchema.safeParse(raw)
      if (!parsed.success) {
        result.skipped += 1
        continue
      }
      const cookie = parsed.data
      const existing = await database.cookies.get(cookie.id)
      if (existing && existing.updatedAt >= cookie.updatedAt) {
        result.unchanged += 1
        continue
      }

      const meta = manifest.images[cookie.id]
      const photo = files[`${root}photos/${cookie.id}.jpg`]
      const thumb = files[`${root}thumbs/${cookie.id}.jpg`]
      const hasPhoto = Boolean(meta && photo && thumb)

      await database.cookies.put({ ...cookie, hasPhoto })
      if (meta && photo && thumb) {
        const full: StoredImage = {
          cookieId: cookie.id,
          mime: meta.mime,
          data: toArrayBuffer(photo),
          width: meta.width,
          height: meta.height,
        }
        const small: StoredImage = {
          cookieId: cookie.id,
          mime: meta.mime,
          data: toArrayBuffer(thumb),
          width: meta.thumbWidth,
          height: meta.thumbHeight,
        }
        const original = files[`${root}originals/${cookie.id}.jpg`]
        await Promise.all([
          database.photos.put(full),
          database.thumbs.put(small),
          meta.original && original
            ? database.originals.put({
                cookieId: cookie.id,
                mime: meta.original.mime,
                data: toArrayBuffer(original),
                width: meta.original.width,
                height: meta.original.height,
              })
            : database.originals.delete(cookie.id),
        ])
      } else {
        await Promise.all([
          database.photos.delete(cookie.id),
          database.thumbs.delete(cookie.id),
          database.originals.delete(cookie.id),
        ])
      }
      if (existing) result.updated += 1
      else result.added += 1
    }
  })

  return result
}

/** Hand a file to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
