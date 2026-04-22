/**
 * PATCH /api/admin/usuarios/[id]
 * Aprovar, Banir ou Reativar um usuário.
 * Apenas ADMIN pode executar.
 *
 * Body: { action: 'APPROVE' | 'BAN' | 'REACTIVATE', banReason?: string }
 */
import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

const bodySchema = z.object({
  action:    z.enum(['APPROVE', 'BAN', 'REACTIVATE']),
  banReason: z.string().max(500).optional(),
})

export async function PATCH(
  req: globalThis.Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  // Impede que o admin se auto-bane
  if (params.id === session.user.id)
    return NextResponse.json({ error: 'Você não pode alterar seu próprio status.' }, { status: 400 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { action, banReason } = parsed.data

  const newStatus = action === 'APPROVE' ? 'ACTIVE' : action === 'BAN' ? 'BANNED' : 'ACTIVE'
  const now       = new Date()

  const user = await prisma.user.update({
    where: { id: params.id },
    data:  {
      status:      newStatus,
      banReason:   action === 'BAN' ? (banReason ?? 'Banido pelo administrador') : null,
      approvedById: session.user.id,
      approvedAt:  now,
    },
    select: { id: true, email: true, name: true, role: true, status: true },
  })

  // Grava na memória da ALFREDO IA para rastreabilidade
  const actionLabel = action === 'APPROVE' ? 'aprovado' : action === 'BAN' ? 'BANIDO' : 'reativado'
  await prisma.alfredoMemory.create({
    data: {
      type:    'INSIGHT',
      title:   `🔐 Usuário ${actionLabel}`,
      content: `${session.user.email} ${actionLabel} o usuário ${user.email} (${user.role}) em ${now.toLocaleString('pt-BR')}. ${banReason ? `Motivo: ${banReason}` : ''}`,
      userId:  session.user.id,
    },
  }).catch(() => null)

  return NextResponse.json({ user, action, success: true })
}

export async function DELETE(
  _req: globalThis.Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  if (params.id === session.user.id)
    return NextResponse.json({ error: 'Você não pode deletar sua própria conta.' }, { status: 400 })

  await prisma.user.delete({ where: { id: params.id } })
  return NextResponse.json({ success: true, deleted: params.id })
}
