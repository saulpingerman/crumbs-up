/**
 * A short, technical line about what went wrong, to show under an error
 * message. On a phone there is no console to look in, so this is what a
 * screenshot of the problem can carry back.
 */
export function errorDetail(error: unknown, where?: string): string {
  const what =
    error instanceof Error
      ? `${error.name === 'Error' ? '' : `${error.name}: `}${error.message}`
      : String(error)
  const line = [where, what.trim() || 'no message'].filter(Boolean).join(' · ')
  return line.length > 160 ? `${line.slice(0, 157)}…` : line
}
