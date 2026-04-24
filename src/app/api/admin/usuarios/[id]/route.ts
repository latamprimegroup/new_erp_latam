import { NextResponse }    from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z }                from 'zod'
import bcrypt               from 'bcryptjs'
import { authOptions }      from '@/lib/auth'
import { prisma }           from '@/lib/prisma'

// ── Schema para ações de status (Aprovar / Banir / Reativar) ─────────────────
const actionSchema = z.object({
  action:    z.enum(['APPROVE', 'BAN', 'REACTIVATE']),
  banReason: z.string().max(500).optional(),
})

// ── Schema para edição de perfil (nome, role, telefone, senha) ───────────────
const updateSchema = z.object({
  name:     z.string().min(1).max(100).optional(),
  phone:    z.string().max(30).nullable().optional(),
  role:     z.string().optional(),
  password: z.string().min(8).max(100).optional(),
})

export async function PATCH(
  req: globalThis.Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.role !== 'ADMIN')
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  // ── Detecta se é ação de status ou edição de perfil ──────────────────────
  const isAction = actionSchema.safeParse(body)

  if (isAction.success) {
    // Impede que o admin se auto-bane
    if (params.id === session.user.id)
      return NextResponse.json({ error: 'Você não pode alterar seu próprio status.' }, { status: 400 })

    const { action, banReason } = isAction.data
    const newStatus = action === 'BAN' ? 'BANNED' : 'ACTIVE'
    const now = new Date()

    const user = await prisma.user.update({
      where: { id: params.id },
      data: {
        status:       newStatus,
        banReason:    action === 'BAN' ? (banReason ?? 'Banido pelo administrador') : null,
        approvedById: session.user.id,
        approvedAt:   now,
      },
      select: { id: true, email: true, name: true, role: true, status: true },
    })

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

  // ── Edição de perfil: nome, telefone, role, senha ────────────────────────
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 422 })

  const { name, phone, role, password } = parsed.data

  const updateData: Record<string, unknown> = {}
  if (name     !== undefined) updateData.name  = name
  if (phone    !== undefined) updateData.phone = phone
  if (role     !== undefined) updateData.role  = role
  if (password !== undefined) updateData.password = await bcrypt.hash(password, 12)

  if (Object.keys(updateData).length === 0)
    return NextResponse.json({ error: 'Nenhum campo para atualizar.' }, { status: 400 })

  const user = await prisma.user.update({
    where:  { id: params.id },
    data:   updateData,
    select: { id: true, email: true, name: true, role: true, status: true, phone: true },
  })

  return NextResponse.json({ user, success: true })
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
