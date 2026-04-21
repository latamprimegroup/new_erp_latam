/**
 * GET /api/compras/ativos/lista-comunidade
 * Gera lista formatada para WhatsApp/Telegram dos ativos disponíveis.
 *
 * Regras:
 *   - Apenas ativos com status AVAILABLE
 *   - NUNCA expõe: custo, fornecedor, credenciais, IDs internos
 *   - CTA fixo: "Consulte o valor via ID no privado"
 *   - Acessível para COMMERCIAL, PURCHASING, ADMIN
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL']

const CATEGORY_EMOJI: Record<string, string> = {
  CONTAS: '💳', PERFIS: '👤', BM: '🏢', PROXIES: '🌐',
  SOFTWARE: '💻', INFRA: '⚙️', HARDWARE: '🖥️', OUTROS: '📦',
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const format   = searchParams.get('format') ?? 'text'  // text | json

  const assets = await prisma.asset.findMany({
    where:   { status: 'AVAILABLE', ...(category ? { category: category as never } : {}) },
    orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
    take:    200,
    select: {
      adsId: true, category: true, subCategory: true,
      displayName: true, description: true, tags: true, specs: true,
    },
  })

  if (format === 'json') return NextResponse.json({ assets, count: assets.length })

  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  // Agrupa por categoria para melhor legibilidade
  const byCategory: Record<string, typeof assets> = {}
  for (const a of assets) {
    if (!byCategory[a.category]) byCategory[a.category] = []
    byCategory[a.category].push(a)
  }

  const sections = Object.entries(byCategory).map(([cat, items]) => {
    const emoji = CATEGORY_EMOJI[cat] ?? '📦'
    const lines = items.map((a) => {
      const tags = a.tags ? `\n   🏷️ ${a.tags.split(',').map((t) => t.trim()).join(' | ')}` : ''
      const sub  = a.subCategory ? ` — ${a.subCategory}` : ''
      return `🆔 *${a.adsId}*\n   📝 ${a.displayName}${sub}${tags}`
    }).join('\n\n')

    return `${emoji} *${cat}* (${items.length} disponível${items.length > 1 ? 'is' : ''})\n${'─'.repeat(30)}\n\n${lines}`
  }).join('\n\n\n')

  const text = [
    `📢 *ESTOQUE ADS ATIVOS — ${date}*`,
    `${'═'.repeat(35)}`,
    ``,
    sections,
    ``,
    `${'═'.repeat(35)}`,
    `💬 *Consulte o valor via ID no privado*`,
    `📦 Pronta entrega | ✅ Qualidade garantida`,
    `⚡ Ativos exclusivos — identidade Ads Ativos`,
  ].join('\n')

  return new NextResponse(text, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="lista-${new Date().toISOString().slice(0,10)}.txt"`,
      'X-Asset-Count': String(assets.length),
    },
  })
}
