import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { calcularMetasMensais, setMetasGlobais, initMetasPadrao } from '@/lib/metas-globais'
import { z } from 'zod'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    await initMetasPadrao()
    const result = await calcularMetasMensais()
    return NextResponse.json(result)
  } catch (e) {
    console.error('Erro ao buscar metas globais:', e)
    return NextResponse.json({ error: 'Erro ao buscar metas' }, { status: 500 })
  }
}

const patchSchema = z.object({
  metaProducao: z.number().int().min(1).max(1_000_000),
  metaVendas: z.number().int().min(1).max(1_000_000),
})

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { metaProducao, metaVendas } = patchSchema.parse(body)
    await setMetasGlobais(metaProducao, metaVendas)
    const result = await calcularMetasMensais()
    return NextResponse.json(result)
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors }, { status: 400 })
    }
    console.error('Erro ao atualizar metas:', e)
    return NextResponse.json({ error: 'Erro ao atualizar metas' }, { status: 500 })
  }
}
