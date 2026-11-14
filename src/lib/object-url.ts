/** Wrap stored image bytes in a URL an <img> can show. Revoke it when done. */
export function toObjectUrl(data: ArrayBuffer, mime: string): string {
  return URL.createObjectURL(new Blob([data], { type: mime }))
}
