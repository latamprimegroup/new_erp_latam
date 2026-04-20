import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  const batch = await prisma.domainProvisionBatch.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { domain: 'asc' },
        select: {
          id: true,
          domain: true,
          registrarStatus: true,
          cloudflareStatus: true,
          serverStatus: true,
          cloudflareZoneId: true,
          videoVariantHash: true,
          publicUrl: true,
          lastError: true,
          logs: true,
        },
      },
    },
  })

  if (!batch) return NextResponse.json({ error: 'Lote não encontrado' }, { status: 404 })

  return NextResponse.json({ batch })
}
