import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireRoles } from '@/lib/api-auth'
import { approveProductionAccount } from '@/lib/production-approve'

const bodySchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
})

export async function POST(req: Request) {
  const auth = await requireRoles(['ADMIN', 'FINANCE'])
  if (!auth.ok) return auth.response
  const session = auth.session

  try {
    const body = await req.json()
    const { ids } = bodySchema.parse(body)
    const uniqueIds = [...new Set(ids)]

    const results: { id: string; ok: boolean; stockAccountId?: string; error?: string }[] = []

    for (const id of uniqueIds) {
      const r = await approveProductionAccount(id, session.user.id)
      if (r.ok) {
        results.push({ id, ok: true, stockAccountId: r.stockAccountId })
      } else if (r.code === 'NOT_FOUND') {
        results.push({ id, ok: false, error: 'Não encontrada' })
      } else {
        results.push({ id, ok: false, error: 'Já aprovada ou rejeitada' })
      }
    }

    const approved = results.filter((x) => x.ok).length
    const failed = results.filter((x) => !x.ok)

    return NextResponse.json({
      ok: failed.length === 0,
      approved,
      failedCount: failed.length,
      results,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error(err)
    return NextResponse.json({ error: 'Erro ao processar lote' }, { status: 500 })
  }
}
