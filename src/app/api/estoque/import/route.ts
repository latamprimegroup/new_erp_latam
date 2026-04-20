import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { AccountPlatform } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseInventoryBulkLines } from '@/lib/inventory-import-parse'
import { salePriceFromCostAndMargin } from '@/lib/inventory-pricing'

const ROLES = ['ADMIN', 'FINANCE']

const bodySchema = z.object({
  raw: z.string().min(1).max(2_000_000),
  defaultMarkupPercent: z.number().min(0).max(500).optional(),
})

/**
 * Importação em massa (CSV / texto multi-linha) — centenas de ativos por requisição.
 * Colunas: plataforma, tipo, moeda_spend, valor_spend, custo_brl [, supplierId [, ano [, nicho [, margem%]]]]
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const json = await req.json()
    const { raw, defaultMarkupPercent: dm } = bodySchema.parse(json)

    const settings = await prisma.systemSetting.findMany({
      where: { key: 'estoque_margem_padrao' },
    })
    const fromDb = parseFloat(settings[0]?.value || '30')
    const defaultMarkup = dm ?? (Number.isFinite(fromDb) ? fromDb : 30)

    const rows = parseInventoryBulkLines(raw)
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma linha válida. Use: PLATAFORMA,tipo,MOEDA,valor_spend,custo_brl[,...]' },
        { status: 400 }
      )
    }
    if (rows.length > 500) {
      return NextResponse.json({ error: 'Máximo 500 linhas por envio' }, { status: 400 })
    }

    const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter(Boolean))] as string[]
    if (supplierIds.length > 0) {
      const found = await prisma.supplier.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true },
      })
      const ok = new Set(found.map((f) => f.id))
      const missing = supplierIds.filter((id) => !ok.has(id))
      if (missing.length > 0) {
        return NextResponse.json(
          { error: `Fornecedor(es) inexistente(s): ${missing.slice(0, 3).join(', ')}` },
          { status: 400 }
        )
      }
    }

    let created = 0
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const markup = r.markupPercent ?? defaultMarkup
        const sale = salePriceFromCostAndMargin(r.purchasePriceBrl, markup)
        await tx.stockAccount.create({
          data: {
            platform: r.platform as AccountPlatform,
            type: r.type,
            source: 'IMPORT',
            yearStarted: r.yearStarted,
            niche: r.niche,
            supplierId: r.supplierId,
            purchasePrice: r.purchasePriceBrl,
            salePrice: sale,
            markupPercent: markup,
            spentDisplayCurrency: r.spendCurrency,
            spentDisplayAmount: r.spendAmount,
            spent: null,
            status: 'AVAILABLE',
            adsAtivosVerified: true,
            description: `Import Inventory Engine — spend vitrine ${r.spendAmount} ${r.spendCurrency}`,
          },
        })
        created++
      }
    })

    return NextResponse.json({ ok: true, imported: created, defaultMarkupPercent: defaultMarkup })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
