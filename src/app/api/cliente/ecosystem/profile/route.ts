/**
 * PATCH — tracking global e rodapé padrão (compliance) para landers.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  globalTrackingScript: z.string().max(100_000).optional().nullable(),
  complianceFooterDefault: z.string().max(20_000).optional().nullable(),
})

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'CLIENT') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = patchSchema.parse(await req.json())
    const data: { globalTrackingScript?: string | null; complianceFooterDefault?: string | null } = {}
    if (body.globalTrackingScript !== undefined) {
      data.globalTrackingScript =
        body.globalTrackingScript == null || body.globalTrackingScript.trim() === ''
          ? null
          : body.globalTrackingScript.trim()
    }
    if (body.complianceFooterDefault !== undefined) {
      data.complianceFooterDefault =
        body.complianceFooterDefault == null || body.complianceFooterDefault.trim() === ''
          ? null
          : body.complianceFooterDefault.trim()
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 })
    }

    const updated = await prisma.clientProfile.update({
      where: { userId: session.user!.id },
      data,
      select: {
        id: true,
        globalTrackingScript: true,
        complianceFooterDefault: true,
      },
    })

    return NextResponse.json(updated)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Dados inválidos' }, { status: 400 })
    }
    throw e
  }
}
