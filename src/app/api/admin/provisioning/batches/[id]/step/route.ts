import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { runProvisionStep } from '@/lib/domain-provision-engine'

const bodySchema = z.object({
  concurrency: z.number().min(1).max(20).optional(),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id: batchId } = await ctx.params

  let concurrency = 5
  try {
    const j = await req.json().catch(() => ({}))
    const p = bodySchema.safeParse(j)
    if (p.success && p.data.concurrency) concurrency = p.data.concurrency
  } catch {
    /* body vazio ok */
  }

  const result = await runProvisionStep(batchId, concurrency)
  return NextResponse.json(result)
}
