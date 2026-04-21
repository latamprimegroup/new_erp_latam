/**
 * GET /api/compras/ativos/catalogo
 * Gera copy em massa para Telegram/WhatsApp com Authority Tags.
 *
 * Query params:
 *   vendorId?   — filtra por fornecedor
 *   category?   — filtra por categoria
 *   spendClass? — HS | MS | LS | DS
 *   status?     — default: AVAILABLE
 *   format?     — telegram (default) | whatsapp | json
 *   template?   — fire (default) | pro | minimal | vip
 *
 * Regras de segurança:
 *   - NUNCA expõe: fornecedor, custo, nicho original, rawData, ID interno
 *   - Authority Tags substituem o nicho original
 *   - COMMERCIAL / ADMIN / PURCHASING têm acesso
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nichoToAuthorityTag } from '@/lib/asset-parser'

const ALLOWED = ['ADMIN', 'PURCHASING', 'COMMERCIAL']

const TIER_EMOJI: Record<string, string> = {
  HS: '💎', MS: '🥇', LS: '🥈', DS: '💵', USD: '💵',
}
const TIER_LABEL: Record<string, string> = {
  HS: 'Diamond Class', MS: 'Gold Class', LS: 'Silver Class', DS: 'Global Dollar',
}

type AssetSpecs = {
  spendClass?: string; year?: number; spendBRL?: number; spendUSD?: number
  currency?: string; nicho?: string; faturamento?: string; verificacao?: string
  platform?: string
}

function formatSpend(specs: AssetSpecs, salePrice: number): string {
  const sc = specs.spendClass ?? 'LS'
  if (sc === 'DS' || specs.currency === 'USD') {
    const usd = specs.spendUSD ?? (specs.spendBRL ? specs.spendBRL / 5.5 : 0)
    return `$${(usd / 1000).toFixed(2)}k USD`
  }
  const brl = specs.spendBRL ?? 0
  return brl >= 1000 ? `+${Math.round(brl / 1000)}k BRL` : `R$${brl}`
}

function generateTelegramLine(asset: {
  adsId: string; displayName: string; salePrice: number
  specs: AssetSpecs; tags: string | null
}, template: string): string {
  const sc    = (asset.specs.spendClass ?? 'LS') as keyof typeof TIER_EMOJI
  const emoji = TIER_EMOJI[sc]  ?? '📦'
  const tier  = TIER_LABEL[sc]  ?? 'Standard'
  const spend = formatSpend(asset.specs, Number(asset.salePrice))
  const yr    = asset.specs.year ? ` | 📅 ${asset.specs.year}` : ''
  const verif = asset.specs.verificacao ? ' | ✅ Verificado' : ''
  const cnpj  = asset.specs.faturamento === 'CNPJ' ? ' | 🏢 CNPJ BR' : ''

  // Authority Tag a partir do nicho (sem expor nicho original)
  const authority = asset.specs.nicho ? nichoToAuthorityTag(asset.specs.nicho) : null
  const authStr   = authority ? `\n   🏆 ${authority}` : ''

  switch (template) {
    case 'pro':
      return [
        `${emoji} *[${asset.adsId}]* — ${asset.displayName}`,
        `   📊 Gasto: ${spend}${yr}${verif}${cnpj}${authStr}`,
        `   💬 Consulte o valor no privado`,
      ].join('\n')

    case 'minimal':
      return `${emoji} \`${asset.adsId}\` — ${tier} | Gasto: ${spend}${yr}${verif}`

    case 'vip':
      return [
        `🔐 *ATIVO VIP — ACESSO EXCLUSIVO*`,
        `🆔 ${asset.adsId}`,
        `${emoji} ${asset.displayName} — ${tier}`,
        `💸 Gasto Histórico: ${spend}${verif}${cnpj}`,
        authStr.trim() ? authStr.trim() : '',
        `📩 *Apenas para clientes cadastrados — envie o ID no privado*`,
      ].filter(Boolean).join('\n')

    default: // fire
      return `${emoji} *${asset.adsId}* | ${tier} | Gasto: ${spend}${yr}${verif}${cnpj}${authStr}`
  }
}

function generateHeader(template: string, count: number, date: string): string {
  switch (template) {
    case 'pro':
      return [
        `📋 *CATÁLOGO ADS ATIVOS — ${date}*`,
        `🔒 Dados do fornecedor protegidos | Identidade exclusiva`,
        `Total disponível: ${count} ativo(s)`,
        `${'═'.repeat(38)}`,
      ].join('\n')
    case 'minimal':
      return `📦 ADS ATIVOS — ${count} ativos | ${date}`
    case 'vip':
      return [
        ``,
        `╔${'═'.repeat(38)}╗`,
        `  🔥 ADS ATIVOS — LISTA VIP ${date} 🔥`,
        `  ${count} ativos exclusivos disponíveis`,
        `╚${'═'.repeat(38)}╝`,
      ].join('\n')
    default: // fire
      return [
        `🔥🔥 *NOVOS ATIVOS — ADS ATIVOS* 🔥🔥`,
        `📅 ${date} | ${count} ativo(s) disponíveis`,
        `${'═'.repeat(38)}`,
      ].join('\n')
  }
}

function generateFooter(template: string): string {
  switch (template) {
    case 'pro':
      return `${'═'.repeat(38)}\n📩 Consulte disponibilidade e valores via ID no privado\n🔒 Fornecimento exclusivo Ads Ativos`
    case 'minimal':
      return `📩 Consulte via ID | Ads Ativos`
    case 'vip':
      return `\n╔${'═'.repeat(38)}╗\n  📩 ENVIE O ID DESEJADO NO PRIVADO\n  ⚡ Pronta entrega | Exclusividade garantida\n╚${'═'.repeat(38)}╝`
    default:
      return `${'═'.repeat(38)}\n📩 *Consulte o valor no privado com o ID*\n📦 Pronta entrega | ✅ Qualidade certificada Ads Ativos`
  }
}

export async function GET(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.role || !ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const vendorId   = searchParams.get('vendorId')
  const category   = searchParams.get('category')
  const spendClass = searchParams.get('spendClass')
  const status     = searchParams.get('status') ?? 'AVAILABLE'
  const format     = searchParams.get('format')  ?? 'telegram'
  const template   = searchParams.get('template') ?? 'fire'
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200)

  const where: Record<string, unknown> = { status }
  if (vendorId)   where.vendorId = vendorId
  if (category)   where.category = category

  const assets = await prisma.asset.findMany({
    where,
    orderBy: [
      // Ordena: Diamond primeiro, depois Gold, USD, Silver
      { salePrice: 'desc' },
      { adsId: 'asc' },
    ],
    take: limit,
    select: {
      id: true, adsId: true, displayName: true, category: true,
      subCategory: true, tags: true, salePrice: true,
      description: true, specs: true, status: true,
    },
  })

  // Filtra por spendClass se informado (está em specs.spendClass)
  const filtered = spendClass
    ? assets.filter((a) => {
        const s = a.specs as AssetSpecs | null
        return s?.spendClass === spendClass
      })
    : assets

  if (format === 'json') {
    return NextResponse.json({
      count:  filtered.length,
      assets: filtered.map((a) => ({
        adsId:        a.adsId,
        displayName:  a.displayName,
        category:     a.category,
        suggestedPrice: Number(a.salePrice),
        spendClass:   (a.specs as AssetSpecs | null)?.spendClass,
        year:         (a.specs as AssetSpecs | null)?.year,
        authorityTag: (a.specs as AssetSpecs | null)?.nicho
          ? nichoToAuthorityTag((a.specs as AssetSpecs).nicho!)
          : null,
      })),
    })
  }

  const date  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const lines = filtered.map((a) =>
    generateTelegramLine({
      adsId:       a.adsId,
      displayName: a.displayName,
      salePrice:   Number(a.salePrice),
      specs:       (a.specs as AssetSpecs) ?? {},
      tags:        a.tags,
    }, template)
  )

  const separator = template === 'minimal' ? '\n' : '\n\n'
  const catalog   = [
    generateHeader(template, filtered.length, date),
    '',
    lines.join(separator),
    '',
    generateFooter(template),
  ].join('\n')

  return new NextResponse(catalog, {
    headers: {
      'Content-Type':        'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="catalogo-ads-ativos-${new Date().toISOString().slice(0,10)}.txt"`,
      'X-Asset-Count':       String(filtered.length),
      'X-Template':          template,
    },
  })
}
