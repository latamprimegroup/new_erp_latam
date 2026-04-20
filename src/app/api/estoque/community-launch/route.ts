import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import type { AccountPlatform } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'FINANCE']

const bodySchema = z.object({
  accountIds: z.array(z.string().min(1)).min(1).max(80),
  sendTelegram: z.boolean().optional(),
})

function skuPublic(id: string, platform: AccountPlatform): string {
  const p = platform.replace('_ADS', '').slice(0, 4)
  return `AA-${p}-${id.slice(0, 8)}`
}

/**
 * Monta o lote para comunidade (Telegram / WhatsApp cola no clipboard no cliente).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const { accountIds, sendTelegram } = bodySchema.parse(await req.json())

    const accounts = await prisma.stockAccount.findMany({
      where: {
        id: { in: accountIds },
        deletedAt: null,
        archivedAt: null,
        status: 'AVAILABLE',
      },
      select: {
        id: true,
        platform: true,
        type: true,
        niche: true,
        spentDisplayAmount: true,
        spentDisplayCurrency: true,
        salePrice: true,
        adsAtivosVerified: true,
      },
    })

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma conta disponível para divulgação (apenas AVAILABLE, não arquivadas).' },
        { status: 400 }
      )
    }

    const lines: string[] = [
      '🔥 LOTE ADS ATIVOS — OPORTUNIDADES VERIFICADAS',
      `📦 ${accounts.length} ativo(s) · fechamento em BRL`,
      '',
    ]

    for (const a of accounts) {
      const sku = skuPublic(a.id, a.platform)
      const spend =
        a.spentDisplayAmount != null && a.spentDisplayCurrency
          ? `💸 Old Spend (vit.): ${a.spentDisplayAmount} ${a.spentDisplayCurrency}`
          : '💸 Histórico sólido (consulte)'
      const price =
        a.salePrice != null
          ? `💰 R$ ${Number(a.salePrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : '💰 Sob consulta'
      const seal = a.adsAtivosVerified ? '✅ Ativo Verificado Ads Ativos' : ''
      lines.push(
        `▸ ${sku} · ${a.platform.replace('_ADS', '')} · ${a.type}`,
        spend,
        price,
        a.niche ? `🏷 ${a.niche}` : '',
        seal,
        `🔗 Ref interna: ${a.id.slice(0, 12)}…`,
        '—',
        ''
      )
    }

    lines.push('📲 Responda no WhatsApp comercial ou abra o ERP para reservar.')
    const text = lines.filter((l) => l !== '').join('\n')

    let telegramSent = false
    if (sendTelegram) {
      const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
      const chatId = process.env.TELEGRAM_COMMUNITY_CHAT_ID?.trim()
      if (token && chatId) {
        const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
          }),
        })
        telegramSent = tg.ok
      }
    }

    return NextResponse.json({ text, telegramSent })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
