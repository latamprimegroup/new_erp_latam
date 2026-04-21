import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const cep = searchParams.get('cep')?.replace(/\D/g, '')

  if (!cep || cep.length !== 8) {
    return NextResponse.json({ error: 'CEP inválido (deve ter 8 dígitos)' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 86400 }, // cache 24h — endereços mudam raramente
    })
    if (!res.ok) return NextResponse.json({ error: 'CEP não encontrado' }, { status: 404 })
    const data = await res.json()
    if (data.erro) return NextResponse.json({ error: 'CEP não encontrado' }, { status: 404 })

    return NextResponse.json({
      cep: data.cep,
      logradouro: data.logradouro,
      complemento: data.complemento,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
      ibge: data.ibge,
    })
  } catch {
    return NextResponse.json({ error: 'Erro ao consultar ViaCEP' }, { status: 502 })
  }
}
