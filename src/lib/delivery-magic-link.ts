/**
 * delivery-magic-link.ts
 *
 * Gera, valida e revoga Magic Links de entrega segura de credenciais.
 * O cliente acessa /entrega/[token] e o IP de acesso é registrado.
 */
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const TOKEN_BYTES = 32
const DEFAULT_EXPIRY_HOURS = 72

// ─── Geração ──────────────────────────────────────────────────────────────────

export async function createDeliveryMagicLink(params: {
  checkoutId:    string
  credentialId?: string | null
  /** Horas de validade (padrão: 72h) */
  expiryHours?:  number
  /** 0 = sem limite de visualizações */
  maxViews?:     number
}): Promise<{ token: string; url: string }> {
  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const expiresAt = new Date(Date.now() + (params.expiryHours ?? DEFAULT_EXPIRY_HOURS) * 3_600_000)

  await prisma.deliveryMagicLink.create({
    data: {
      token,
      checkoutId:   params.checkoutId,
      credentialId: params.credentialId ?? null,
      maxViews:     params.maxViews ?? 0,
      expiresAt,
    },
  })

  const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const url  = `${base}/entrega/${token}`
  return { token, url }
}

// ─── Validação (para a rota pública) ─────────────────────────────────────────

export type MagicLinkValidateResult =
  | { valid: true;  link: MagicLinkWithPayload }
  | { valid: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'REVOKED' | 'MAX_VIEWS' }

export type MagicLinkWithPayload = {
  id:          string
  token:       string
  checkoutId:  string
  credentialId: string | null
  viewCount:   number
  maxViews:    number
  expiresAt:   Date | null
  checkout: {
    id:          string
    buyerName:   string
    buyerEmail:  string | null
    paidAt:      Date | null
    warrantyEndsAt: Date | null
    listing: { title: string; assetCategory: string }
  }
  credential: {
    id:           string
    loginEmail:   string | null
    loginPassword: string | null
    recoveryEmail: string | null
    twoFaSeed:    string | null
    extraData:    unknown
    assetStatus:  string
    executorName: string | null
    supplierName: string | null
  } | null
}

export async function validateMagicLink(token: string): Promise<MagicLinkValidateResult> {
  const link = await prisma.deliveryMagicLink.findUnique({
    where: { token },
    select: {
      id:          true,
      token:       true,
      checkoutId:  true,
      credentialId: true,
      viewCount:   true,
      maxViews:    true,
      expiresAt:   true,
      revokedAt:   true,
      checkout: {
        select: {
          id:          true,
          buyerName:   true,
          buyerEmail:  true,
          paidAt:      true,
          warrantyEndsAt: true,
          listing: { select: { title: true, assetCategory: true } },
        },
      },
      credential: {
        select: {
          id:           true,
          loginEmail:   true,
          loginPassword: true,
          recoveryEmail: true,
          twoFaSeed:    true,
          extraData:    true,
          assetStatus:  true,
          executorName: true,
          supplierName: true,
        },
      },
    },
  }).catch(() => null)

  if (!link) return { valid: false, reason: 'NOT_FOUND' }
  if (link.revokedAt) return { valid: false, reason: 'REVOKED' }
  if (link.expiresAt && link.expiresAt < new Date()) return { valid: false, reason: 'EXPIRED' }
  if (link.maxViews > 0 && link.viewCount >= link.maxViews) return { valid: false, reason: 'MAX_VIEWS' }

  return { valid: true, link: link as unknown as MagicLinkWithPayload }
}

// ─── Registro de acesso ───────────────────────────────────────────────────────

export async function recordMagicLinkAccess(params: {
  linkId:    string
  ip:        string | null
  userAgent: string | null
  referer:   string | null
}) {
  await Promise.all([
    prisma.deliveryAccessLog.create({
      data: {
        linkId:    params.linkId,
        ip:        params.ip        ? params.ip.slice(0, 64)       : null,
        userAgent: params.userAgent ? params.userAgent.slice(0, 300) : null,
        referer:   params.referer   ? params.referer.slice(0, 500)  : null,
      },
    }),
    prisma.deliveryMagicLink.update({
      where: { id: params.linkId },
      data:  { viewCount: { increment: 1 } },
    }),
  ])
}

// ─── Revogação ────────────────────────────────────────────────────────────────

export async function revokeMagicLinksForCheckout(checkoutId: string, reason: string) {
  await prisma.deliveryMagicLink.updateMany({
    where: {
      checkoutId,
      revokedAt: null,
    },
    data: {
      revokedAt:    new Date(),
      revokeReason: reason.slice(0, 200),
    },
  })
}

// ─── Estatísticas de acesso (para o painel de saúde) ─────────────────────────

export async function getMagicLinkAccessStats(linkId: string) {
  const logs = await prisma.deliveryAccessLog.findMany({
    where:   { linkId },
    orderBy: { accessedAt: 'desc' },
    take:    50,
    select:  { ip: true, userAgent: true, accessedAt: true },
  })
  return logs
}
