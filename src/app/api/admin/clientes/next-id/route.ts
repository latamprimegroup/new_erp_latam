import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateNextClientId } from '@/lib/client-id-sequencial'

/**
 * GET - Retorna o próximo clientCode sugerido (C289, C290...)
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const nextId = await generateNextClientId()
    return NextResponse.json({ nextClientId: nextId })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Erro ao gerar ID' }, { status: 500 })
  }
}
