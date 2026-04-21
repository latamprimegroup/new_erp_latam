import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { peekNextClientId, formatClientCode } from '@/lib/client-id-sequencial'
import { prisma } from '@/lib/prisma'

/**
 * GET — Próximo clientCode sugerido (sem consumir a sequência).
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const nextId = await peekNextClientId()
    return NextResponse.json({ nextClientId: nextId })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao gerar ID' }, { status: 500 })
  }
}

/**
 * PATCH — Ajusta manualmente o contador da sequência.
 * Body: { nextNumber: number }  (o próximo código gerado será C{nextNumber})
 */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  let body: { nextNumber?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const n = Number(body.nextNumber)
  if (!Number.isInteger(n) || n < 1 || n > 999999) {
    return NextResponse.json({ error: 'nextNumber deve ser um inteiro entre 1 e 999999' }, { status: 422 })
  }

  // Verifica se já existe algum clientCode >= ao número desejado
  const conflict = await prisma.clientProfile.findFirst({
    where: { clientCode: { not: null } },
    orderBy: { clientCode: 'desc' },
    select: { clientCode: true },
  })
  const conflictNum = conflict?.clientCode?.match(/^C(\d+)$/i)?.[1]
  if (conflictNum && parseInt(conflictNum, 10) >= n) {
    return NextResponse.json({
      error: `Já existe o código ${conflict?.clientCode}. O contador deve ser maior que ${conflictNum}.`,
    }, { status: 409 })
  }

  // Upsert da linha de sequência com lastNumber = n - 1 (próximo gerado será n)
  await prisma.clientCodeSequence.upsert({
    where: { id: 1 },
    create: { id: 1, lastNumber: n - 1 },
    update: { lastNumber: n - 1 },
  })

  return NextResponse.json({ ok: true, nextClientId: formatClientCode(n) })
}
