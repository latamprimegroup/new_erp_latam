'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_INICIO: 'Aguardando início',
  EM_ANDAMENTO: 'Em andamento',
  PARCIALMENTE_ENTREGUE: 'Parcialmente entregue',
  FINALIZADA: 'Finalizada',
  ATRASADA: 'Atrasada',
  EM_REPOSICAO: 'Em reposição',
  CANCELADA: 'Cancelada',
}

const REASON_LABELS: Record<string, string> = {
  BLOQUEIO: 'Bloqueio',
  LIMITE_GASTO: 'Limite de gasto',
  ERRO_ESTRUTURAL: 'Erro estrutural',
  PROBLEMA_PERFIL: 'Problema de perfil',
  OUTRO: 'Outro',
}

const REPOSITION_STATUS: Record<string, string> = {
  SOLICITADA: 'Solicitada',
  APROVADA: 'Aprovada',
  NEGADA: 'Negada',
  CONCLUIDA: 'Concluída',
}

export function EntregasGruposDetailClient({ id }: { id: string }) {
  const router = useRouter()
  const [delivery, setDelivery] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingQty, setUpdatingQty] = useState(false)
  const [newQuantityDelivered, setNewQuantityDelivered] = useState(0)
  const [showRepositionForm, setShowRepositionForm] = useState(false)
  const [repositionForm, setRepositionForm] = useState({
    quantity: 1,
    reason: 'BLOQUEIO' as string,
    reasonOther: '',
  })
  const [submittingReposition, setSubmittingReposition] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/entregas-grupos/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setDelivery(data)
        setNewQuantityDelivered(data.quantityDelivered ?? 0)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [id])

  async function handleUpdateQuantity(e: React.FormEvent) {
    e.preventDefault()
    setUpdatingQty(true)
    const res = await fetch(`/api/entregas-grupos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantityDelivered: newQuantityDelivered }),
    })
    if (res.ok) load()
    else {
      const err = await res.json()
      alert(err.error || 'Erro ao atualizar')
    }
    setUpdatingQty(false)
  }

  async function handleAddReposition(e: React.FormEvent) {
    e.preventDefault()
    setSubmittingReposition(true)
    const res = await fetch(`/api/entregas-grupos/${id}/reposicoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: repositionForm.quantity,
        reason: repositionForm.reason,
        reasonOther: repositionForm.reason === 'OUTRO' ? repositionForm.reasonOther : undefined,
      }),
    })
    if (res.ok) {
      setShowRepositionForm(false)
      setRepositionForm({ quantity: 1, reason: 'BLOQUEIO', reasonOther: '' })
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao registrar')
    }
    setSubmittingReposition(false)
  }

  async function handleRepositionStatus(reposicaoId: string, status: string) {
    const res = await fetch(`/api/entregas-grupos/${id}/reposicoes/${reposicaoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) load()
  }

  if (loading || !delivery) {
    return <p className="text-gray-500 py-8">Carregando...</p>
  }

  const d = delivery as {
    groupNumber: string
    quantityContracted: number
    quantityDelivered: number
    quantityPending: number
    progressPercent: number
    status: string
    client: { user: { name: string; email: string } }
    responsible: { name: string }
    order?: { product: string }
    repositions: Array<{
      id: string
      quantity: number
      reason: string
      reasonOther: string | null
      status: string
      requestedAt: string
      analyst: { name: string } | null
    }>
    logs: Array<{
      action: string
      createdAt: string
      user: { name: string }
      details: unknown
    }>
  }

  return (
    <div>
      <Link href="/dashboard/entregas-grupos" className="text-sm text-gray-500 hover:text-primary-600 mb-4 inline-block">
        ← Voltar
      </Link>
      <h1 className="heading-1 mb-6">Entrega {d.groupNumber}</h1>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Resumo</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">Cliente</p>
            <p className="font-medium">{d.client?.user?.name || d.client?.user?.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Responsável</p>
            <p className="font-medium">{d.responsible?.name || '—'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <span className={`px-2 py-0.5 rounded text-sm ${
              d.status === 'FINALIZADA' ? 'bg-green-100' :
              d.status === 'ATRASADA' ? 'bg-red-100' :
              d.status === 'EM_REPOSICAO' ? 'bg-amber-100' : 'bg-gray-100'
            }`}>
              {STATUS_LABELS[d.status] || d.status}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500">Progresso</p>
            <p className="font-bold">{d.progressPercent}%</p>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all"
            style={{ width: `${d.progressPercent}%` }}
          />
        </div>

        <form onSubmit={handleUpdateQuantity} className="flex gap-2 items-end mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Quantidade entregue</label>
            <input
              type="number"
              min={0}
              max={d.quantityContracted}
              value={newQuantityDelivered}
              onChange={(e) => setNewQuantityDelivered(Number(e.target.value) || 0)}
              className="input-field w-24"
            />
          </div>
          <button type="submit" disabled={updatingQty || d.status === 'FINALIZADA'} className="btn-primary">
            {updatingQty ? 'Salvando...' : 'Atualizar'}
          </button>
        </form>
        <p className="text-sm text-gray-500">
          Contratada: {d.quantityContracted} | Entregue: {d.quantityDelivered} | Pendente: {d.quantityPending}
        </p>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Reposições</h2>
          <button
            onClick={() => setShowRepositionForm(!showRepositionForm)}
            disabled={d.status === 'FINALIZADA'}
            className="btn-primary text-sm"
          >
            {showRepositionForm ? 'Cancelar' : 'Adicionar reposição'}
          </button>
        </div>
        {showRepositionForm && (
          <form onSubmit={handleAddReposition} className="mb-4 p-4 bg-gray-50 rounded space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm mb-1">Quantidade</label>
                <input
                  type="number"
                  min={1}
                  max={d.quantityDelivered}
                  value={repositionForm.quantity}
                  onChange={(e) => setRepositionForm((f) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Motivo</label>
                <select
                  value={repositionForm.reason}
                  onChange={(e) => setRepositionForm((f) => ({ ...f, reason: e.target.value }))}
                  className="input-field"
                >
                  {Object.entries(REASON_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              {repositionForm.reason === 'OUTRO' && (
                <div>
                  <label className="block text-sm mb-1">Descrição</label>
                  <input
                    type="text"
                    value={repositionForm.reasonOther}
                    onChange={(e) => setRepositionForm((f) => ({ ...f, reasonOther: e.target.value }))}
                    className="input-field"
                    required
                  />
                </div>
              )}
            </div>
            <button type="submit" disabled={submittingReposition} className="btn-primary">
              {submittingReposition ? 'Salvando...' : 'Registrar'}
            </button>
          </form>
        )}
        {d.repositions?.length === 0 ? (
          <p className="text-gray-500">Nenhuma reposição.</p>
        ) : (
          <ul className="space-y-2">
            {d.repositions?.map((r: { id: string; quantity: number; reason: string; status: string; requestedAt: string; analyst: { name: string } | null }) => (
              <li key={r.id} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span>{r.quantity} un — {REASON_LABELS[r.reason]} — {REPOSITION_STATUS[r.status]}</span>
                <div>
                  {r.status === 'SOLICITADA' && (
                    <>
                      <button
                        onClick={() => handleRepositionStatus(r.id, 'APROVADA')}
                        className="text-green-600 text-sm mr-2"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleRepositionStatus(r.id, 'NEGADA')}
                        className="text-red-600 text-sm"
                      >
                        Negar
                      </button>
                    </>
                  )}
                  {r.status === 'APROVADA' && (
                    <button
                      onClick={() => handleRepositionStatus(r.id, 'CONCLUIDA')}
                      className="text-green-600 text-sm"
                    >
                      Marcar concluída
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Histórico</h2>
        {d.logs?.length === 0 ? (
          <p className="text-gray-500">Nenhum registro.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {d.logs?.map((log: { id?: string; action: string; createdAt: string; user: { name: string } }, i: number) => (
              <li key={log.id || i} className="flex gap-2">
                <span className="text-gray-500">
                  {new Date(log.createdAt).toLocaleString('pt-BR')}
                </span>
                <span>{log.user?.name}</span>
                <span>{log.action}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
