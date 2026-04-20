import { NextResponse } from 'next/server'
import { requireRoles } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'
import { gatekeeperAudit } from '@/lib/gatekeeper/audit-log'
import { maskCnpj } from '@/lib/gatekeeper/masking'

/**
 * PATCH — Atualiza tag de nicho manual do operador (Nutra, Estética, …).
 * Body: { nicheOperatorTag: string | null }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(['ADMIN'])
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  }

  let body: { nicheOperatorTag?: string | null }
  try {
    body = (await req.json()) as { nicheOperatorTag?: string | null }
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const raw = body.nicheOperatorTag
  const nicheOperatorTag =
    raw === null || raw === undefined
      ? null
      : typeof raw === 'string'
        ? raw.trim().slice(0, 120) || null
        : null

  const row = await prisma.inventoryCnpj.findUnique({ where: { id } })
  if (!row) {
    return NextResponse.json({ error: 'CNPJ cofre não encontrado' }, { status: 404 })
  }

  await prisma.inventoryCnpj.update({
    where: { id },
    data: { nicheOperatorTag },
  })

  gatekeeperAudit('CNPJ_TAG', `Tag de nicho atualizada: ${maskCnpj(row.cnpj)}`, {
    nicheOperatorTag: nicheOperatorTag ?? '—',
  })

  return NextResponse.json({
    ok: true,
    id,
    nicheOperatorTag,
    nicheLabel: nicheOperatorTag || row.nicheInferred,
  })
}
