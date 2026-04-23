/**
 * POST /api/cron/cleanup-expired-pix
 *
 * Libera ativos presos em QUARANTINE quando o PIX expira sem pagamento.
 * Protegido por Bearer token (CRON_SECRET) — chame a cada 5 min via Vercel Cron ou cURL externo.
 *
 * Configurar em vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/cleanup-expired-pix", "schedule": "*/5 * * * *" }]
 * }
 *
 * E adicionar ao env: CRON_SECRET=<segredo-forte>
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  // Autenticação simples — Vercel injeta Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization') ?? ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // ─── 1. QuickSaleCheckout (Venda Rápida / loja) ──────────────────────────
  const expiredQuick = await prisma.quickSaleCheckout.findMany({
    where: {
      status:    'PENDING',
      expiresAt: { lt: now },
    },
    select: { id: true, reservedAssetIds: true },
  })

  let quickReleased = 0
  if (expiredQuick.length > 0) {
    const assetIdsToRelease = expiredQuick.flatMap((c) => c.reservedAssetIds as string[])

    await prisma.$transaction([
      // Libera ativos de volta ao estoque
      prisma.asset.updateMany({
        where: { id: { in: assetIdsToRelease }, status: 'QUARANTINE' },
        data:  { status: 'AVAILABLE' },
      }),
      // Marca checkouts como EXPIRED
      prisma.quickSaleCheckout.updateMany({
        where: { id: { in: expiredQuick.map((c) => c.id) } },
        data:  { status: 'EXPIRED' },
      }),
    ])
    quickReleased = assetIdsToRelease.length
  }

  // ─── 2. SalesCheckout (checkout individual /checkout/[adsId]) ────────────
  const expiredSales = await prisma.salesCheckout.findMany({
    where: {
      status:    'PENDING',
      expiresAt: { lt: now },
    },
    select: { id: true, assetId: true },
  })

  let salesReleased = 0
  if (expiredSales.length > 0) {
    const salesAssetIds = expiredSales.map((c) => c.assetId).filter(Boolean) as string[]

    await prisma.$transaction([
      prisma.asset.updateMany({
        where: { id: { in: salesAssetIds }, status: 'QUARANTINE' },
        data:  { status: 'AVAILABLE' },
      }),
      prisma.salesCheckout.updateMany({
        where: { id: { in: expiredSales.map((c) => c.id) } },
        data:  { status: 'EXPIRED' },
      }),
    ])
    salesReleased = salesAssetIds.length
  }

  const total = quickReleased + salesReleased
  console.log(`[cron/cleanup-expired-pix] Released ${total} assets (quick=${quickReleased} sales=${salesReleased})`)

  return NextResponse.json({
    ok:             true,
    quickCheckouts: expiredQuick.length,
    salesCheckouts: expiredSales.length,
    assetsReleased: total,
    ranAt:          now.toISOString(),
  })
}

// Permite chamada GET simples para Vercel Cron (que usa GET)
export async function GET(req: NextRequest) {
  return POST(req)
}
