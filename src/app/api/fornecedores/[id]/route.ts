import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'
import { decrypt, encrypt } from '@/lib/encryption'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  contact: z.string().optional().nullable(),
  taxId: z.string().max(32).optional().nullable(),
  pixKey: z.string().max(512).optional().nullable(),
  notes: z.string().optional().nullable(),
})

function normalizeTaxId(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 11 || digits.length === 14) return digits
  return String(raw).trim().slice(0, 32)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const existing = await prisma.supplier.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })

  try {
    const body = await req.json()
    const data = patchSchema.parse(body)
    const updateData: {
      name?: string
      contact?: string | null
      taxId?: string | null
      pixKeyEncrypted?: string | null
      notes?: string | null
    } = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.contact !== undefined) updateData.contact = data.contact
    if (data.taxId !== undefined) updateData.taxId = normalizeTaxId(data.taxId)
    if (data.pixKey !== undefined) {
      const t = data.pixKey?.trim()
      updateData.pixKeyEncrypted = t ? encrypt(t) : null
    }
    if (data.notes !== undefined) updateData.notes = data.notes

    const supplier = await prisma.supplier.update({
      where: { id },
      data: updateData,
      include: { _count: { select: { accounts: true, emails: true, emailBatches: true } } },
    })

    await audit({
      userId: session.user.id,
      action: 'supplier_updated',
      entity: 'Supplier',
      entityId: id,
    })

    const { pixKeyEncrypted, ...rest } = supplier
    return NextResponse.json({
      ...rest,
      pixKey: pixKeyEncrypted ? decrypt(pixKeyEncrypted) : null,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const roles = ['ADMIN', 'MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  const s = await prisma.supplier.findUnique({
    where: { id },
    include: {
      _count: { select: { accounts: true, emails: true, emailBatches: true } },
    },
  })
  if (!s) return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })

  const linked =
    s._count.accounts + s._count.emails + s._count.emailBatches
  if (linked > 0) {
    return NextResponse.json(
      {
        error:
          'Não é possível excluir: existem contas de estoque, e-mails ou lotes vinculados a este fornecedor. Remova ou transfira os vínculos antes.',
      },
      { status: 400 }
    )
  }

  await prisma.supplier.delete({ where: { id } })

  await audit({
    userId: session.user.id,
    action: 'supplier_deleted',
    entity: 'Supplier',
    entityId: id,
    details: { name: s.name },
  })

  return NextResponse.json({ ok: true })
}
