import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await ctx.params

  const items = await prisma.domainProvisionItem.findMany({
    where: { batchId: id },
    orderBy: { domain: 'asc' },
  })

  if (items.length === 0) {
    return NextResponse.json({ error: 'Lote vazio' }, { status: 404 })
  }

  const header = [
    'domain',
    'public_url',
    'registrar',
    'cloudflare',
    'servidor',
    'video_hash',
    'erro',
  ].join(',')
  const rows = items.map((it) =>
    [
      it.domain,
      it.publicUrl || '',
      it.registrarStatus,
      it.cloudflareStatus,
      it.serverStatus,
      it.videoVariantHash || '',
      (it.lastError || '').replace(/"/g, '""'),
    ]
      .map((c) => (/,|"/.test(String(c)) ? `"${String(c)}"` : c))
      .join(',')
  )

  const csv = '\ufeff' + [header, ...rows].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="provisionamento-${id.slice(0, 8)}.csv"`,
    },
  })
}
