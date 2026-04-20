import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/encryption'

const createSchema = z.object({
  name: z.string().min(1),
  contact: z.string().optional(),
  taxId: z.string().max(32).optional().nullable(),
  pixKey: z.string().max(512).optional().nullable(),
  notes: z.string().optional(),
})

function normalizeTaxId(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length === 11 || digits.length === 14) return digits
  return String(raw).trim().slice(0, 32)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = session.user?.role
  const isPrivileged = role === 'ADMIN' || role === 'MANAGER'

  const list = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { accounts: true, emails: true, emailBatches: true } } },
  })

  if (!isPrivileged) {
    return NextResponse.json(list.map(({ id, name }) => ({ id, name })))
  }

  const payload = list.map((s) => {
    const { pixKeyEncrypted, ...rest } = s
    return {
      ...rest,
      pixKey: pixKeyEncrypted ? decrypt(pixKeyEncrypted) : null,
    }
  })
  return NextResponse.json(payload)
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'MANAGER']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = createSchema.parse(body)
    const taxId = normalizeTaxId(data.taxId ?? undefined)
    const pixTrim = data.pixKey?.trim()
    const supplier = await prisma.supplier.create({
      data: {
        name: data.name,
        contact: data.contact || null,
        taxId,
        pixKeyEncrypted: pixTrim ? encrypt(pixTrim) : null,
        notes: data.notes || null,
      },
      include: { _count: { select: { accounts: true, emails: true, emailBatches: true } } },
    })
    const { pixKeyEncrypted: enc, ...rest } = supplier
    return NextResponse.json({
      ...rest,
      pixKey: enc ? decrypt(enc) : null,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erro ao cadastrar' }, { status: 500 })
  }
}
