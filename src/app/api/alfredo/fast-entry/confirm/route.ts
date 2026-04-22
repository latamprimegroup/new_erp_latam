/**
 * POST /api/alfredo/fast-entry/confirm
 * Confirma um FastEntryDraft e cria os registros definitivos:
 *
 *   ENTRADA → FinancialEntry (INCOME, PENDING) + notificação interna
 *   SAIDA   → FinancialEntry (EXPENSE, PAID)
 *
 * Também pode REJEITAR (action: 'REJECT')
 */
import { NextResponse }     from 'next/server'
import { getServerSession }  from 'next-auth/next'
import { z }                 from 'zod'
import { authOptions }       from '@/lib/auth'
import { prisma }            from '@/lib/prisma'

const confirmSchema = z.object({
  draftId:  z.string(),
  action:   z.enum(['CONFIRM', 'REJECT']),
  // Dados revisados pelo usuário (substituem os extraídos)
  amount:   z.number().positive().optional(),
  date:     z.string().optional(),
  name:     z.string().max(300).optional(),
  category: z.string().max(100).optional(),
  notes:    z.string().max(500).optional(),
  walletId: z.string().optional(),
})

// Mapa de categoria textual → categoria do FinancialEntry
const CATEGORY_DISPLAY_MAP: Record<string, string> = {
  'Custo de Ativos':  'Custo de Ativos',
  'Infraestrutura':   'Infraestrutura',
  'Recursos Humanos': 'Recursos Humanos',
  'Impostos':         'Impostos',
  'Comissões':        'Comissões',
  'Mídia Paga':       'Mídia Paga',
  'Software/SaaS':    'Software/SaaS',
  'Recebível':        'Recebível',
  'Geral':            'Geral',
}

export async function POST(req: globalThis.Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { draftId, action, amount, date, name, category, notes, walletId } = parsed.data

  const draft = await prisma.fastEntryDraft.findUnique({ where: { id: draftId } })
  if (!draft) return NextResponse.json({ error: 'Draft não encontrado' }, { status: 404 })
  if (draft.status !== 'PENDING') return NextResponse.json({ error: `Draft já está em status ${draft.status}` }, { status: 409 })
  if (draft.createdById !== session.user.id && !['ADMIN', 'FINANCE'].includes(session.user.role ?? ''))
    return NextResponse.json({ error: 'Sem permissão para confirmar este draft' }, { status: 403 })

  // ── REJEITAR ─────────────────────────────────────────────────────────────
  if (action === 'REJECT') {
    await prisma.fastEntryDraft.update({ where: { id: draftId }, data: { status: 'REJECTED', confirmedAt: new Date() } })
    return NextResponse.json({ ok: true, action: 'REJECTED' })
  }

  // ── CONFIRMAR ────────────────────────────────────────────────────────────
  const finalAmount   = amount   ?? Number(draft.extractedAmount ?? 0)
  const finalDate     = date     ? new Date(date) : (draft.extractedDate ?? new Date())
  const finalName     = name     ?? draft.extractedName ?? 'Desconhecido'
  const finalCategory = category ?? draft.extractedCategory ?? 'Geral'
  const finalCat      = CATEGORY_DISPLAY_MAP[finalCategory] ?? finalCategory
  const finalNotes    = notes ?? draft.extractedDescription ?? ''

  if (finalAmount <= 0) return NextResponse.json({ error: 'Valor inválido (deve ser > 0)' }, { status: 422 })

  let createdEntryId: string | null = null

  // ── Cria o FinancialEntry ─────────────────────────────────────────────────
  const payMethodRaw = draft.extractedPaymentMethod ?? 'OUTRO'
  const payMethod    = ['PIX', 'TED', 'DOC', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'CASH', 'CRIPTO', 'OUTRO'].includes(payMethodRaw)
    ? payMethodRaw as 'PIX' | 'TED' | 'DOC' | 'BOLETO' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO' | 'CASH' | 'CRIPTO' | 'OUTRO'
    : 'OUTRO'

  const entry = await prisma.financialEntry.create({
    data: {
      type:          draft.type === 'ENTRADA' ? 'INCOME' : 'EXPENSE',
      category:      finalCat,
      value:         finalAmount,
      currency:      draft.extractedCurrency ?? 'BRL',
      date:          finalDate,
      paymentDate:   draft.type === 'SAIDA' ? finalDate : undefined,
      entryStatus:   draft.type === 'ENTRADA' ? 'PENDING' : 'PAID',
      paymentMethod: payMethod,
      walletId:      walletId ?? undefined,
      description:   [
        `ALFREDO IA Fast-Entry`,
        finalName ? `| ${finalName}` : '',
        draft.extractedTransactionId ? `| Tx: ${draft.extractedTransactionId}` : '',
        finalNotes ? `| ${finalNotes}` : '',
      ].filter(Boolean).join(' '),
      reconciled:    false,
    },
  })
  createdEntryId = entry.id

  // ── Registra na memória da ALFREDO IA ─────────────────────────────────────
  await prisma.alfredoMemory.create({
    data: {
      type:    'INSIGHT',
      title:   `Fast-Entry: ${draft.type === 'ENTRADA' ? '💰 Recebimento' : '💸 Despesa'} — R$${finalAmount.toLocaleString('pt-BR')}`,
      content: `${draft.type === 'ENTRADA' ? 'Recebimento' : 'Despesa'} de R$${finalAmount.toLocaleString('pt-BR')} registrado via Fast-Entry. Parte: "${finalName}". Categoria: ${finalCat}. Método: ${payMethod}. ${draft.extractedTransactionId ? `Tx ID: ${draft.extractedTransactionId}` : ''}`,
      metadata: { draftId, entryId: createdEntryId, amount: finalAmount, category: finalCat },
      userId:  session.user.id,
    },
  }).catch(() => null)

  // ── Atualiza o draft ──────────────────────────────────────────────────────
  await prisma.fastEntryDraft.update({
    where: { id: draftId },
    data:  {
      status:           'CONFIRMED',
      confirmedAt:      new Date(),
      confirmedAmount:  finalAmount,
      confirmedDate:    finalDate,
      confirmedName:    finalName,
      confirmedCategory: finalCat,
      confirmedNotes:   finalNotes,
      createdEntryId,
    },
  })

  // ── Notificação para equipe de vendas (ENTRADA) ──────────────────────────
  if (draft.type === 'ENTRADA') {
    await prisma.alfredoMemory.create({
      data: {
        type:    'INSIGHT',
        title:   `📬 Recebimento Detectado — R$${finalAmount.toLocaleString('pt-BR')}`,
        content: `ALFREDO IA detectou recebimento de R$${finalAmount.toLocaleString('pt-BR')} de "${finalName}" via ${payMethod} em ${finalDate.toLocaleDateString('pt-BR')}. Lançamento financeiro criado (ID: ${createdEntryId}). Equipe comercial: verifique se há OS pendente de vinculação.`,
        pinned:  true,
        userId:  session.user.id,
      },
    }).catch(() => null)
  }

  return NextResponse.json({ ok: true, action: 'CONFIRMED', entryId: createdEntryId })
}
