import { createHmac, timingSafeEqual } from 'crypto'

function secretKey(): string {
  return (
    process.env.ADS_CORE_DOC_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'ads-core-doc-token-dev-only'
  )
}

/** Token opaco para leitura de documento sem cookie (modo filesystem / fallback). */
export function mintAdsCoreDocumentViewToken(args: {
  assetId: string
  tipo: string
  userId: string
  expiresAtSec: number
}): string {
  const payload = [args.assetId, args.tipo, args.userId, String(args.expiresAtSec)].join('|')
  const sig = createHmac('sha256', secretKey()).update(payload).digest('base64url')
  return Buffer.from(payload, 'utf8').toString('base64url') + '.' + sig
}

export function verifyAdsCoreDocumentViewToken(token: string): {
  assetId: string
  tipo: string
  userId: string
  expiresAtSec: number
} | null {
  const cut = token.lastIndexOf('.')
  if (cut <= 0) return null
  const bodyB64 = token.slice(0, cut)
  const sig = token.slice(cut + 1)
  let payload: string
  try {
    payload = Buffer.from(bodyB64, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const expected = createHmac('sha256', secretKey()).update(payload).digest('base64url')
  try {
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return null
    }
  } catch {
    return null
  }
  const parts = payload.split('|')
  if (parts.length !== 4) return null
  const [assetId, tipo, userId, expStr] = parts
  const expiresAtSec = parseInt(expStr, 10)
  if (!Number.isFinite(expiresAtSec)) return null
  return { assetId, tipo, userId, expiresAtSec }
}

export function isAdsCoreDocumentTokenForAsset(
  parsed: { assetId: string; tipo: string; expiresAtSec: number },
  assetId: string,
  tipo: string
): boolean {
  if (Math.floor(Date.now() / 1000) > parsed.expiresAtSec) return false
  return parsed.assetId === assetId && parsed.tipo === tipo
}
