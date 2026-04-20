import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import {
  cfCleanConflictingRootRecords,
  cfCreateARecord,
  cfDeleteApexARecords,
} from '@/lib/cloudflare-dns'

export async function POST(_req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { itemId } = await ctx.params

  const item = await prisma.domainProvisionItem.findUnique({
    where: { id: itemId },
    include: { batch: true },
  })
  if (!item?.cloudflareZoneId) {
    return NextResponse.json({ error: 'Item sem zona Cloudflare' }, { status: 400 })
  }

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    return NextResponse.json({ error: 'CLOUDFLARE_API_TOKEN não configurado' }, { status: 400 })
  }

  try {
    await cfDeleteApexARecords(item.cloudflareZoneId, item.domain)
    await cfCleanConflictingRootRecords(item.cloudflareZoneId, item.domain)
    await cfCreateARecord(item.cloudflareZoneId, item.domain, item.batch.targetServerIp, true)
    return NextResponse.json({ ok: true, message: 'DNS do apex recriado (A proxied).' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
