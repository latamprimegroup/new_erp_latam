/**
 * POST /api/socio/transfer
 * Transferência interna: Ads Ativos → Sócio
 * Cria simultaneamente:
 *   - FinancialEntry EXPENSE na empresa (Pró-labore / Distribuição de Lucro)
 *   - SocioEntry    RECEITA no perfil pessoal
 *   - SocioTransfer como registro da operação
 *
 * Apenas ADMIN pode iniciar transferências.
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

const schema = z.object({
  type:   z.enum(['PRO_LABORE', 'DISTRIBUICAO_LUCRO', 'ADIANTAMENTO', 'REEMBOLSO']),
  amount: z.number().positive(),
  date:   z.string(),
  notes:  z.string().max(500).optional(),
})

// Mapeamento tipo de transferência → categoria pessoal
const CATEGORY_MAP: Record<string, string> = {
  PRO_LABORE:          'PRO_LABORE',
  DISTRIBUICAO_LUCRO:  'DISTRIBUICAO_LUCRO',
  ADIANTAMENTO:        'ADIANTAMENTO',
  REEMBOLSO:           'REEMBOLSO_EMPRESA',
}

const COMPANY_CATEGORY: Record<string, string> = {
  PRO_LABORE:         'Pró-labore',
  DISTRIBUICAO_LUCRO: 'Distribuição de Lucros',
  ADIANTAMENTO:       'Adiantamento Sócio',
  REEMBOLSO:          'Reembolso Sócio',
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Apenas sócios/administradores podem iniciar transferências' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { type, amount, date, notes } = parsed.data

  // Upsert do perfil pessoal
  const profile = await prisma.socioProfile.upsert({
    where:  { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  })

  // 1) Lança DESPESA no caixa da empresa
  const companyEntry = await prisma.financialEntry.create({
    data: {
      type:          'EXPENSE',
      category:      COMPANY_CATEGORY[type] ?? 'Distribuição Sócio',
      value:         amount,
      date:          new Date(date),
      paymentDate:   new Date(date),
      entryStatus:   'PAID',
      paymentMethod: 'PIX',
      description:   `Transferência sócio: ${COMPANY_CATEGORY[type]}${notes ? ` — ${notes}` : ''}`,
    },
  })

  // 2) Lança RECEITA no perfil pessoal
  const socioEntry = await prisma.socioEntry.create({
    data: {
      profileId:        profile.id,
      type:             'RECEITA',
      category:         (CATEGORY_MAP[type] ?? 'OUTRO') as 'PRO_LABORE' | 'DISTRIBUICAO_LUCRO' | 'ADIANTAMENTO' | 'REEMBOLSO_EMPRESA' | 'OUTRO',
      amount,
      date:             new Date(date),
      description:      `${COMPANY_CATEGORY[type]} — Ads Ativos${notes ? ` | ${notes}` : ''}`,
      paymentMethod:    'PIX',
      isCompanyTransfer: true,
      companyTransferId: companyEntry.id,
    },
  })

  // 3) Registra a transferência
  const transfer = await prisma.socioTransfer.create({
    data: {
      profileId:      profile.id,
      type:           type as 'PRO_LABORE' | 'DISTRIBUICAO_LUCRO' | 'ADIANTAMENTO' | 'REEMBOLSO',
      amount,
      date:           new Date(date),
      companyEntryId: companyEntry.id,
      socioEntryId:   socioEntry.id,
      approvedById:   session.user.id,
      notes,
    },
  })

  // 4) Memória ALFREDO IA
  await prisma.alfredoMemory.create({
    data: {
      type:    'INSIGHT',
      title:   `💸 Transferência Sócio: ${COMPANY_CATEGORY[type]} — R$${amount.toLocaleString('pt-BR')}`,
      content: `${COMPANY_CATEGORY[type]} de R$${amount.toLocaleString('pt-BR')} transferido para conta pessoal do sócio em ${new Date(date).toLocaleDateString('pt-BR')}. Lançado no DRE da empresa como despesa e no painel pessoal como receita.`,
      metadata: { transferId: transfer.id, companyEntryId: companyEntry.id, socioEntryId: socioEntry.id },
      userId:  session.user.id,
    },
  }).catch(() => null)

  return NextResponse.json({ transfer, companyEntry: { id: companyEntry.id }, socioEntry: { id: socioEntry.id } }, { status: 201 })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  const profile = await prisma.socioProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json([])

  const transfers = await prisma.socioTransfer.findMany({
    where:   { profileId: profile.id },
    orderBy: { date: 'desc' },
    take:    50,
    include: { approvedBy: { select: { name: true } } },
  })
  return NextResponse.json(transfers)
}
