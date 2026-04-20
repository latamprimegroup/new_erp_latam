/** Base pública para montar links de redirecionamento (tokens). */
export function appPublicBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXTAUTH_URL?.trim()
  return u ? u.replace(/\/$/, '') : ''
}
