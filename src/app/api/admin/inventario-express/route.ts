import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ROLES = ['ADMIN', 'PRODUCTION_MANAGER']

function currencyFromTipo(tipoConta: string): string {
  const t = tipoConta.toUpperCase()
  if (t.includes('USD')) return 'USD'
  if (t.includes('EUR')) return 'EUR'
  if (t.includes('GBP')) return 'GBP'
  if (t.includes('MXN')) return 'MXN'
  if (t.includes('ARS')) return 'ARS'
  return 'BRL'
}

function normalizeId(raw: string): string {
  return raw.replace(/[\s\-\.]/g, '').replace(/[^\w]/g, '').trim()
}

const rowSchema = z.object({
  tipoConta:    z.string().min(1),
  configuracao: z.string().min(1),
  documentacao: z.string().min(1),
  producerName: z.string().min(1, 'Selecione o produtor da conta'),
  ids:          z.array(z.string().min(1)).min(1).max(500),
})

const bodySchema = z.object({
  rows: z.array(rowSchema).min(1).max(20),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!session.user?.role || !ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message || 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  // Normaliza IDs e detecta duplicatas internas
  const allIds: string[] = []
  const normalizedRows = body.rows.map((row, rowIdx) => {
    const cleaned = row.ids.map(normalizeId).filter(Boolean)
    const unique = [...new Set(cleaned)]
    const dupes = cleaned.filter((id, i) => cleaned.indexOf(id) !== i)
    return { ...row, ids: unique, dupes, rowIdx }
  })

  // Duplicatas entre linhas
  const crossDupes: string[] = []
  for (const row of normalizedRows) {
    for (const id of row.ids) {
      if (allIds.includes(id)) crossDupes.push(id)
      else allIds.push(id)
    }
  }
  if (crossDupes.length > 0) {
    return NextResponse.json(
      { error: `IDs duplicados entre linhas: ${crossDupes.slice(0, 5).join(', ')}` },
      { status: 400 }
    )
  }

  // Duplicatas no banco de dados
  const existing = await prisma.stockAccount.findMany({
    where: { googleAdsCustomerId: { in: allIds }, deletedAt: null },
    select: { googleAdsCustomerId: true },
  })
  if (existing.length > 0) {
    const existingIds = existing.map((e) => e.googleAdsCustomerId).filter(Boolean)
    return NextResponse.json(
      {
        error: `${existingIds.length} ID(s) já cadastrado(s) no estoque: ${existingIds.slice(0, 5).join(', ')}`,
        duplicateIds: existingIds,
      },
      { status: 409 }
    )
  }

  const launchedBy = session.user.name || session.user.email || session.user.id
  const launchedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  let totalCriadas = 0
  const detalhes: { row: number; tipoConta: string; produtor: string; criadas: number }[] = []

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of normalizedRows) {
        const currency = currencyFromTipo(row.tipoConta)
        const isPlugPlay = [
          'G2 Manual',
          'Com G2 e Verificação',
          'Com Op. Comercial',
          'USD Automático',
          'EUR Automático',
        ].includes(row.configuracao)

        // niche armazena o produtor — visível para o Comercial no estoque
        const nicheTag = `Produtor: ${row.producerName}`

        const desc =
          `[Inventário Express] ` +
          `Tipo: ${row.tipoConta} | Config: ${row.configuracao} | Doc: ${row.documentacao} | ` +
          `Produtor: ${row.producerName} | Lançado por: ${launchedBy} em ${launchedAt}`

        for (const accountId of row.ids) {
          await tx.stockAccount.create({
            data: {
              platform:            'GOOGLE_ADS',
              type:                row.tipoConta,
              source:              'MANUAL',
              status:              'AVAILABLE',
              googleAdsCustomerId: accountId,
              spentDisplayCurrency: currency,
              isPlugPlay,
              adsAtivosVerified:   true,
              niche:               nicheTag,
              description:         desc,
            },
          })
          totalCriadas++
        }

        detalhes.push({
          row:      row.rowIdx,
          tipoConta: row.tipoConta,
          produtor: row.producerName,
          criadas:  row.ids.length,
        })
      }
    })
  } catch (err) {
    console.error('[inventario-express] Erro na transação:', err)
    return NextResponse.json(
      { error: 'Falha ao salvar. Nenhuma conta foi criada. Verifique os dados e tente novamente.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, totalCriadas, detalhes })
}
