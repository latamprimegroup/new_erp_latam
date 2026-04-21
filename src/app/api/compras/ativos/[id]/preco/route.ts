/**
 * GET /api/compras/ativos/[id]/preco
 * Consulta de preço por ID Ads Ativos — Double-Blind para o Comercial.
 *
 * COMMERCIAL / DELIVERER vê apenas:
 *   - adsId, displayName, category, subCategory, status, tags
 *   - suggestedPrice (salePrice)
 *   - floorPrice (preço de piso — mínimo negociável sem aprovação)
 *   - marginStatus: OK | FLOOR | REQUIRES_APPROVAL
 *
 * PURCHASING / ADMIN vê adicionalmente:
 *   - costPrice, markupPct, minMarginPct, vendor.name
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL', 'DELIVERER', 'FINANCE']

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const role = session.user.role
  const hasSensitive = role === 'ADMIN' || role === 'PURCHASING'

  // Permite buscar por adsId (AA-CONT-000001) ou por id interno
  const asset = await prisma.asset.findFirst({
    where: {
      OR: [{ id: params.id }, { adsId: params.id }],
    },
    include: {
      vendor: hasSensitive ? { select: { id: true, name: true, category: true, rating: true, paymentTerms: true } } : false,
    },
  })

  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const suggestedPrice = Number(asset.salePrice)
  const floorPrice     = asset.floorPrice ? Number(asset.floorPrice) : null
  const costPrice      = Number(asset.costPrice)

  // Dados públicos (comercial)
  const base = {
    id:             asset.id,
    adsId:          asset.adsId,
    category:       asset.category,
    subCategory:    asset.subCategory,
    status:         asset.status,
    displayName:    asset.displayName,
    description:    asset.description,
    tags:           asset.tags,
    suggestedPrice,
    floorPrice,
    // Diz ao vendedor se ele tem autonomia ou precisa de aprovação
    pricing: {
      suggestedPrice,
      floorPrice,
      marginInfo: floorPrice
        ? `Você pode negociar até ${floorPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} sem aprovação.`
        : `Preço de piso não definido — qualquer valor requer aprovação.`,
      requiresApprovalBelow: floorPrice ?? suggestedPrice,
    },
  }

  // Dados sensíveis (somente PURCHASING/ADMIN)
  if (hasSensitive) {
    const margin    = suggestedPrice - costPrice
    const marginPct = costPrice > 0 ? (margin / suggestedPrice) * 100 : 0
    return NextResponse.json({
      ...base,
      sensitive: {
        costPrice,
        markupPct:    asset.markupPct ? Number(asset.markupPct) : null,
        minMarginPct: asset.minMarginPct ? Number(asset.minMarginPct) : null,
        grossMargin:  margin,
        grossMarginPct: marginPct,
        vendor: (asset as typeof asset & { vendor?: { name: string } }).vendor ?? null,
      },
    })
  }

  return NextResponse.json(base)
}
