/** Mascaramento de endpoint de proxy para exibição ao mentorado (War Room). */
export function maskProxyHostKey(key: string | null | undefined): string {
  if (!key || !key.trim()) return '—'
  const s = key.trim()
  const host = s.split(':')[0] || s
  const parts = host.split('.')
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    return `${parts[0]}.${parts[1]}.•••.•••${s.includes(':') ? ' :•••' : ''}`
  }
  if (host.length <= 8) return `${host.slice(0, 2)}•••`
  return `${host.slice(0, 4)}••••${host.slice(-2)}`
}

export function maskAdsPowerProfileId(id: string | null | undefined): string | null {
  if (!id || !id.trim()) return null
  const t = id.trim()
  if (t.length <= 4) return '••••'
  return `ID ••••${t.slice(-4)}`
}
