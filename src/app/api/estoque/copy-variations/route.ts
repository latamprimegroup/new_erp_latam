import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateInventoryCopyVariations } from '@/lib/inventory-copy'

const ROLES = ['ADMIN', 'FINANCE']

const bodySchema = z.object({
  accountIds: z.array(z.string().min(1)).min(1).max(40),
})

/**
 * Gera 3 variações de copy (GPT-4o / fallback) por ativo selecionado.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const { accountIds } = bodySchema.parse(await req.json())

    const accounts = await prisma.stockAccount.findMany({
      where: { id: { in: accountIds }, deletedAt: null },
      select: {
        id: true,
        platform: true,
        type: true,
        niche: true,
        yearStarted: true,
        spentDisplayAmount: true,
        spentDisplayCurrency: true,
        salePrice: true,
        adsAtivosVerified: true,
      },
    })

    if (accounts.length === 0) {
      return NextResponse.json({ error: 'Nenhuma conta encontrada' }, { status: 404 })
    }

    const variations = await generateInventoryCopyVariations(
      accounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        type: a.type,
        niche: a.niche,
        yearStarted: a.yearStarted,
        spentDisplayAmount: a.spentDisplayAmount != null ? Number(a.spentDisplayAmount) : null,
        spentDisplayCurrency: a.spentDisplayCurrency,
        salePriceBrl: a.salePrice != null ? Number(a.salePrice) : null,
        adsAtivosVerified: a.adsAtivosVerified,
      }))
    )

    return NextResponse.json({ items: variations })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
