import { createHash } from 'node:crypto'

/** UA sintético estável por UNI — referência para headers distintos no edge (não é fingerprinting oculto). */
export function suggestedChromeUaForUni(uniId: string): string {
  const h = createHash('sha256').update(uniId).digest('hex')
  const minor = 120 + (parseInt(h.slice(0, 2), 16) % 8)
  const patch = parseInt(h.slice(2, 4), 16) % 50
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${minor}.0.${patch}.0 Safari/537.36`
}

export function suggestedAcceptLanguageForLocale(locale: string | null | undefined): string {
  const l = (locale || 'pt-BR').trim()
  if (!l) return 'pt-BR,pt;q=0.9,en;q=0.8'
  return `${l},pt;q=0.9,en;q=0.8`
}
