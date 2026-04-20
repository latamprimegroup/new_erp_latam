import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { cfSetApexProxy } from '@/lib/cloudflare-dns'

const bodySchema = z.object({
  proxied: z.boolean(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ itemId: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { itemId } = await ctx.params
  const { proxied } = bodySchema.parse(await req.json())

  const item = await prisma.domainProvisionItem.findUnique({ where: { id: itemId } })
  if (!item?.cloudflareZoneId) {
    return NextResponse.json({ error: 'Item sem zona Cloudflare' }, { status: 400 })
  }

  if (!process.env.CLOUDFLARE_API_TOKEN) {
    return NextResponse.json({ error: 'CLOUDFLARE_API_TOKEN não configurado' }, { status: 400 })
  }

  const ok = await cfSetApexProxy(item.cloudflareZoneId, item.domain, proxied)
  if (!ok) return NextResponse.json({ error: 'Registro A do apex não encontrado' }, { status: 404 })

  return NextResponse.json({ ok: true, proxied })
}
