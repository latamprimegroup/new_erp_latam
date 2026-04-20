import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { CreativeAgencyJobStatus } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { audit } from '@/lib/audit'

const patchSchema = z.object({
  status: z.nativeEnum(CreativeAgencyJobStatus).optional(),
  deliverableUrl: z
    .string()
    .max(2000)
    .refine((s) => {
      if (!s) return true
      try {
        const u = new URL(s)
        return u.protocol === 'http:' || u.protocol === 'https:'
      } catch {
        return false
      }
    }, 'URL inválida')
    .optional()
    .nullable(),
  uniqueMetadataHashDone: z.boolean().optional(),
  ctrSnapshotAtDelivery: z.number().min(0).max(100).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const role = session.user?.role
  if (role !== 'ADMIN' && role !== 'COMMERCIAL' && role !== 'PRODUCTION_MANAGER') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { id } = await params
  let body: z.infer<typeof patchSchema>
  try {
    body = patchSchema.parse(await req.json())
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const existing = await prisma.creativeAgencyJob.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const updated = await prisma.creativeAgencyJob.update({
    where: { id },
    data: {
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.deliverableUrl !== undefined ? { deliverableUrl: body.deliverableUrl || null } : {}),
      ...(body.uniqueMetadataHashDone !== undefined
        ? { uniqueMetadataHashDone: body.uniqueMetadataHashDone }
        : {}),
      ...(body.ctrSnapshotAtDelivery !== undefined
        ? { ctrSnapshotAtDelivery: body.ctrSnapshotAtDelivery }
        : {}),
    },
  })

  await audit({
    userId: session.user!.id,
    action: 'CREATIVE_VAULT_JOB_UPDATE',
    entity: 'CreativeAgencyJob',
    entityId: id,
    details: body as Record<string, unknown>,
  })

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    deliverableUrl: updated.deliverableUrl,
    uniqueMetadataHashDone: updated.uniqueMetadataHashDone,
    ctrSnapshotAtDelivery: updated.ctrSnapshotAtDelivery?.toNumber() ?? null,
  })
}
