'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Integracao = {
  id: string
  nome: string
  descricao: string
  conectado: boolean
  envVars: string[]
  /** Link interno opcional (ex.: módulo ligado à integração) */
  dashboardHref?: string
}

export function IntegracoesClient() {
  const [data, setData] = useState<{ integracoes: Integracao[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/integracoes')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading || !data) {
    return (
      <div>
        <h1 className="heading-1 mb-6">Integrações</h1>
        <p className="text-gray-500">Carregando...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Integrações e Conexões</h1>
      </div>

      <p className="text-gray-600 mb-8">
        Status das integrações do ERP. Configure as variáveis no <code className="text-sm bg-gray-100 px-1 rounded">.env</code> ou no painel da hospedagem.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {data.integracoes.map((i) => (
          <div
            key={i.id}
            className={`card flex flex-col ${
              i.conectado
                ? 'border-l-4 border-l-green-500'
                : 'border-l-4 border-l-amber-400'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-slate-800">{i.nome}</h2>
                <p className="text-sm text-gray-500 mt-1">{i.descricao}</p>
              </div>
              <span
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${
                  i.conectado
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {i.conectado ? 'Conectado' : 'Não configurado'}
              </span>
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Variáveis:</p>
              <p className="text-xs font-mono text-gray-600">
                {i.envVars.join(', ')}
              </p>
              {i.dashboardHref && (
                <Link
                  href={i.dashboardHref}
                  className="inline-block mt-3 text-sm text-primary-600 hover:underline font-medium"
                >
                  → Abrir {i.dashboardHref === '/dashboard/roi-crm' ? 'Dashboard ROI & CRM' : 'módulo'}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card bg-slate-50">
        <h3 className="font-medium text-slate-800 mb-2">Como configurar</h3>
        <p className="text-sm text-slate-600">
          Edite o arquivo <code className="bg-white px-1 rounded">.env</code> na raiz do projeto ou configure as variáveis de ambiente no painel da sua hospedagem (Vercel, Railway, etc.). Nunca exponha chaves no código.
        </p>
        <Link
          href="/dashboard/admin/config"
          className="inline-block mt-3 text-sm text-primary-600 hover:underline"
        >
          → Configurações do sistema
        </Link>
      </div>
    </div>
  )
}
