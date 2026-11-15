export const MIN_PASSWORD = 8

export const looksLikeEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim())

/** What is wrong with a password typed twice, if anything. */
export function passwordProblem(password: string, again: string): string | null {
  if (password.length < MIN_PASSWORD)
    return `Choose a password of at least ${MIN_PASSWORD} characters.`
  if (password !== again) return 'Those passwords don’t match.'
  return null
}
