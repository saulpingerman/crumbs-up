import type { Category } from '@/lib/rubric'

/** Text color for a category (the darker, readable cut of its hue). */
export const categoryText: Record<Category, string> = {
  taste: 'text-taste-ink',
  texture: 'text-texture-ink',
  appearance: 'text-look-ink',
}

export const categoryBg: Record<Category, string> = {
  taste: 'bg-taste',
  texture: 'bg-texture',
  appearance: 'bg-look',
}

export const categorySoft: Record<Category, string> = {
  taste: 'bg-taste-soft',
  texture: 'bg-texture-soft',
  appearance: 'bg-look-soft',
}

export const categoryInkVar: Record<Category, string> = {
  taste: 'var(--taste-ink)',
  texture: 'var(--texture-ink)',
  appearance: 'var(--look-ink)',
}
