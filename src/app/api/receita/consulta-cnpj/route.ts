import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { fetchCnpjReceitaFederal } from '@/lib/receita-federal'

/**
 * GET /api/receita/consulta-cnpj?cnpj=...
 * Consulta CNPJ na Receita Federal (Brasil API / ReceitaWS)
 * Requer autenticação (Produtor, Admin, etc.)
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const roles = ['ADMIN', 'PRODUCER', 'FINANCE']
  if (!session.user?.role || !roles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const cnpj = searchParams.get('cnpj')
  if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
    return NextResponse.json({ error: 'CNPJ inválido. Informe 14 dígitos.' }, { status: 400 })
  }

  const data = await fetchCnpjReceitaFederal(cnpj)
  if (!data) {
    return NextResponse.json(
      { error: 'CNPJ não encontrado ou serviço indisponível. Tente novamente.' },
      { status: 404 }
    )
  }

  return NextResponse.json(data)
}
