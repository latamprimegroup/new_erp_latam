'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PlugPlayDashboard } from '@/app/dashboard/plugplay/PlugPlayDashboard'

type Payment = {
  id: string
  amount: { toString: () => string }
  status: string
  paidAt: string | null
  createdAt: string
  operation: { id: string; niche: string; wentLiveAt: string | null }
  collaborator: { name: string | null; email: string }
}

export default function AdminBlackPage() {
  const [data, setData] = useState<{ payments: Payment[]; summary: { totalPending: number; totalPaid: number } } | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [valorConta, setValorConta] = useState(50)

  function load() {
    fetch('/api/black/payments')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function handleProcess24h() {
    setProcessing(true)
    try {
      const res = await fetch('/api/black/payments', { method: 'POST' })
      const d = await res.json()
      if (res.ok) alert(`${d.processed} pagamento(s) criado(s) para contas que sobreviveram 24h`)
      load()
    } finally {
      setProcessing(false)
    }
  }

  async function handleApprove(id: string) {
    setApproving(id)
    try {
      const res = await fetch(`/api/black/payments/${id}/approve`, { method: 'POST' })
      if (res.ok) load()
    } finally {
      setApproving(null)
    }
  }

  if (loading) return <><Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700 mb-4 inline-block">← Admin</Link><p className="text-gray-500">Carregando...</p></>

  const pending = data?.payments?.filter((p) => p.status === 'PENDING') || []

  return (
    <div>
      <div className="flex gap-4 items-center flex-wrap mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Plug & Play Black – Admin</h1>
        <Link href="/dashboard/plugplay" className="btn-secondary text-sm ml-auto">
          Ver operações
        </Link>
      </div>

      <p className="text-gray-600 text-sm mb-6">
        Visão completa dos indicadores e pagamentos. Contas que duraram +24h no ar geram pagamento para o colaborador.
      </p>

      <section className="mb-8">
        <h2 className="heading-2 mb-4">Indicadores globais</h2>
        <PlugPlayDashboard isAdmin={true} />
      </section>

      <section>
        <h2 className="heading-2 mb-4">Pagamentos</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <p className="text-sm text-gray-500">Pendente de pagamento</p>
          <p className="text-2xl font-bold text-amber-600">R$ {data?.summary?.totalPending?.toLocaleString('pt-BR') || '0'}</p>
          <p className="text-xs text-gray-400">{pending.length} conta(s)</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Já pago</p>
          <p className="text-2xl font-bold text-green-600">R$ {data?.summary?.totalPaid?.toLocaleString('pt-BR') || '0'}</p>
        </div>
        <div className="card">
          <button
            onClick={handleProcess24h}
            disabled={processing}
            className="btn-primary w-full"
          >
            {processing ? 'Processando...' : 'Processar sobreviventes 24h'}
          </button>
          <p className="text-xs text-gray-500 mt-2">Cria pagamentos PENDING para operações LIVE +24h</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Pagamentos pendentes</h2>
        {pending.length === 0 ? (
          <p className="text-gray-500 py-6">Nenhum pagamento pendente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Colaborador</th>
                  <th className="pb-2 pr-4">Nicho</th>
                  <th className="pb-2 pr-4">Data live</th>
                  <th className="pb-2 pr-4">Valor</th>
                  <th className="pb-2">Ação</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-3 pr-4">{p.collaborator.name || p.collaborator.email}</td>
                    <td className="py-3 pr-4">{p.operation.niche}</td>
                    <td className="py-3 pr-4">{p.operation.wentLiveAt ? new Date(p.operation.wentLiveAt).toLocaleString('pt-BR') : '—'}</td>
                    <td className="py-3 pr-4">R$ {Number(p.amount).toLocaleString('pt-BR')}</td>
                    <td className="py-3">
                      <button
                        onClick={() => handleApprove(p.id)}
                        disabled={!!approving}
                        className="btn-primary text-sm py-1 px-2"
                      >
                        {approving === p.id ? '...' : 'Aprovar pagamento'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </section>
    </div>
  )
}
