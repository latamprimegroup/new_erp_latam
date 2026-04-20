import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/api-auth'
import { audit } from '@/lib/audit'
import { supersedeAdsCoreRgStockForAsset } from '@/lib/ads-core-rg-stock'
import { touchAdsCoreEmProducaoOnOpen } from '@/lib/ads-core-producer-touch'

function isGerente(role?: string) {
  return role === 'ADMIN' || role === 'PRODUCTION_MANAGER'
}

function canProducerAsset(role: string | undefined, userId: string, producerId: string | null) {
  return role === 'PRODUCER' && producerId === userId
}

/**
 * Sorteia apenas linhas DISPONIVEL. UTILIZADO e EM_USO nunca entram na roleta.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth.ok) return auth.response

  const { id } = await params
  const asset = await prisma.adsCoreAsset.findUnique({ where: { id } })
  if (!asset) return NextResponse.json({ error: 'Ativo não encontrado' }, { status: 404 })

  const { role, id: userId } = auth.session.user
  if (!isGerente(role) && !canProducerAsset(role, userId, asset.producerId)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined

  await touchAdsCoreEmProducaoOnOpen(prisma, {
    assetId: id,
    userId,
    role,
    ip,
  })

  try {
    const result = await prisma.$transaction(async (tx) => {
      await supersedeAdsCoreRgStockForAsset(tx, id)

      const picked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM ads_core_rg_stock WHERE status = 'DISPONIVEL' ORDER BY RAND() LIMIT 1
      `
      const rowId = picked[0]?.id
      if (!rowId) {
        return { error: 'no_stock' as const }
      }

      const stock = await tx.adsCoreRgStock.findUnique({ where: { id: rowId } })
      if (!stock) {
        return { error: 'race' as const }
      }

      const reserved = await tx.adsCoreRgStock.updateMany({
        where: { id: rowId, status: 'DISPONIVEL' },
        data: {
          status: 'EM_USO',
          assetId: id,
          assignedAt: new Date(),
        },
      })
      if (reserved.count !== 1) {
        return { error: 'race' as const }
      }

      await tx.adsCoreAsset.update({
        where: { id },
        data: {
          docRgFrentePath: stock.frentePath,
          docRgVersoPath: stock.versoPath,
        },
      })

      return { ok: true as const, stockId: rowId }
    })

    if ('error' in result) {
      if (result.error === 'no_stock') {
        return NextResponse.json(
          { error: 'Não há pares de RG disponíveis no estoque. Peça ao gerente para abastecer.' },
          { status: 409 }
        )
      }
      return NextResponse.json({ error: 'Concorrência no estoque — tente novamente.' }, { status: 409 })
    }

    await audit({
      userId,
      action: 'ads_core_rg_sorteado',
      entity: 'AdsCoreAsset',
      entityId: id,
      details: { rgStockId: result.stockId },
      ip,
    })

    return NextResponse.json({ ok: true, rgStockId: result.stockId })
  } catch (e) {
    console.error('sortear-rg', e)
    return NextResponse.json({ error: 'Falha ao sortear RG' }, { status: 500 })
  }
}
