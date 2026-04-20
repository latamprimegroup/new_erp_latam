'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Send, Paperclip, ChevronDown } from 'lucide-react'

const REASONS = [
  { value: 'ERRO_CONFIGURACAO', label: 'Erro de configuração' },
  { value: 'FALHA_ATIVACAO', label: 'Falha de ativação' },
  { value: 'SUSPENSAO_IMEDIATA', label: 'Suspensão imediata' },
  { value: 'LOGIN_INVALIDO', label: 'Login inválido' },
  { value: 'OUTRO', label: 'Outro' },
] as const

const STATUS_LABELS: Record<string, string> = {
  EM_ANALISE: 'Em análise',
  EM_REPOSICAO: 'Em reposição',
  CONCLUIDO: 'Concluído',
  NEGADO_TERMO: 'Negado (termos)',
}

type Acc = {
  id: string
  platform: string
  googleAdsCustomerId: string | null
  credential?: { email: string | null } | null
}

type RmaRow = {
  id: string
  reason: string
  status: string
  openedAt: string
  reasonDetail: string | null
  additionalComments: string | null
  evidenceUrls: unknown
  originalAccount: { id: string; googleAdsCustomerId: string | null }
}

type Msg = {
  id: string
  body: string
  createdAt: string
  user: { name: string | null; email: string | null; role: string }
}

export function ClienteRmaClient() {
  const [list, setList] = useState<RmaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [q, setQ] = useState('')
  const [searchHits, setSearchHits] = useState<Acc[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<Acc | null>(null)
  const [reason, setReason] = useState<string>('ERRO_CONFIGURACAO')
  const [reasonDetail, setReasonDetail] = useState('')
  const [additionalComments, setAdditionalComments] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [msgDraft, setMsgDraft] = useState('')
  const [msgLoading, setMsgLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/cliente/rma')
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d.items) ? d.items : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!q.trim() || q.length < 2) {
      setSearchHits([])
      return
    }
    const t = setTimeout(() => {
      setSearching(true)
      fetch(`/api/cliente/rma/lookup?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((d) => setSearchHits(Array.isArray(d.accounts) ? d.accounts : []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false))
    }, 320)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (!detailId) {
      setMessages([])
      return
    }
    setMsgLoading(true)
    fetch(`/api/cliente/rma/${detailId}/messages`)
      .then((r) => r.json())
      .then((d) => setMessages(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false))
  }, [detailId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAccount) return
    if (reason === 'OUTRO' && reasonDetail.trim().length < 8) {
      alert('Descreva o motivo em pelo menos 8 caracteres.')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('originalAccountId', selectedAccount.id)
      fd.set('reason', reason)
      if (reasonDetail.trim()) fd.set('reasonDetail', reasonDetail.trim())
      if (additionalComments.trim()) fd.set('additionalComments', additionalComments.trim())
      files.forEach((f) => fd.append('evidence', f))
      const res = await fetch('/api/cliente/rma', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert((data as { error?: string }).error || 'Erro ao enviar')
        return
      }
      setSelectedAccount(null)
      setQ('')
      setReasonDetail('')
      setAdditionalComments('')
      setFiles([])
      load()
    } finally {
      setSubmitting(false)
    }
  }

  async function sendMessage() {
    if (!detailId || !msgDraft.trim()) return
    const res = await fetch(`/api/cliente/rma/${detailId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: msgDraft.trim() }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert((err as { error?: string }).error || 'Erro')
      return
    }
    setMsgDraft('')
    const d = await fetch(`/api/cliente/rma/${detailId}/messages`).then((r) => r.json())
    setMessages(Array.isArray(d.messages) ? d.messages : [])
  }

  const evidenceList = useMemo(() => {
    const row = list.find((x) => x.id === detailId)
    if (!row?.evidenceUrls) return []
    const j = row.evidenceUrls
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  }, [list, detailId])

  return (
    <div className="space-y-10 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white mb-1">Reposição de conta (RMA)</h1>
        <p className="text-sm text-zinc-500">
          Abra um pedido formal ligado à conta que já lhe foi entregue. Anexe prints para agilizar a análise.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300">Nova solicitação</h2>

        <div className="relative">
          <label className="block text-xs text-zinc-500 mb-1">Conta entregue (ID ou login Google)</label>
          {selectedAccount ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-950/20 px-3 py-2 text-sm text-zinc-200">
              <span className="font-mono text-xs text-zinc-400">{selectedAccount.id}</span>
              {selectedAccount.googleAdsCustomerId ? (
                <span className="ml-2 text-sky-300">{selectedAccount.googleAdsCustomerId}</span>
              ) : null}
              {selectedAccount.credential?.email ? (
                <span className="block text-xs text-zinc-500 mt-1">{selectedAccount.credential.email}</span>
              ) : null}
              <button
                type="button"
                className="mt-2 text-xs text-violet-400 hover:underline"
                onClick={() => {
                  setSelectedAccount(null)
                  setQ('')
                }}
              >
                Escolher outra conta
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar…"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            />
          )}
          {!selectedAccount && q.length >= 2 ? (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl max-h-48 overflow-auto">
              {searching ? (
                <p className="p-3 text-xs text-zinc-500">A pesquisar…</p>
              ) : searchHits.length === 0 ? (
                <p className="p-3 text-xs text-zinc-500">Nenhuma conta encontrada.</p>
              ) : (
                searchHits.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 text-zinc-200"
                    onClick={() => {
                      setSelectedAccount(a)
                      setQ('')
                      setSearchHits([])
                    }}
                  >
                    <span className="font-mono text-xs text-zinc-500">{a.id.slice(0, 10)}</span>
                    {a.googleAdsCustomerId ? (
                      <span className="ml-2 text-sky-300">{a.googleAdsCustomerId}</span>
                    ) : null}
                    {a.credential?.email ? (
                      <span className="ml-2 text-zinc-400">{a.credential.email}</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Motivo</label>
          <div className="relative">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white pr-8"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-zinc-500" />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Descrição do problema</label>
          <textarea
            value={reasonDetail}
            onChange={(e) => setReasonDetail(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
            placeholder="O que aconteceu com a conta?"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Evidências (prints)</label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-zinc-600 px-3 py-3 text-sm text-zinc-400 hover:border-violet-500/50">
            <Paperclip className="h-4 w-4" />
            <span>Anexar imagens (JPEG, PNG, WebP, GIF — máx. 6 ficheiros, 8MB cada)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </label>
          {files.length > 0 ? (
            <p className="text-xs text-zinc-500 mt-1">{files.length} ficheiro(s) selecionado(s)</p>
          ) : null}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">Comentários adicionais</label>
          <textarea
            value={additionalComments}
            onChange={(e) => setAdditionalComments(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !selectedAccount}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar solicitação
        </button>
      </form>

      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">As suas solicitações</h2>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
        ) : list.length === 0 ? (
          <p className="text-sm text-zinc-500">Ainda não há pedidos de reposição.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDetailId(detailId === r.id ? null : r.id)}
                  className={`w-full text-left rounded-lg border px-4 py-3 text-sm transition ${
                    detailId === r.id ? 'border-violet-500 bg-violet-950/30' : 'border-zinc-800 bg-zinc-950/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-500">{r.id.slice(0, 10)}</span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === 'CONCLUIDO'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : r.status === 'NEGADO_TERMO'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-amber-500/20 text-amber-200'
                      }`}
                    >
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </div>
                  <p className="text-zinc-300 mt-1">
                    Conta: {r.originalAccount.googleAdsCustomerId || r.originalAccount.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Aberto em {new Date(r.openedAt).toLocaleString('pt-BR')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {detailId ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">Mensagens com a equipa</h3>
          <p className="text-xs text-zinc-500">
            A produção pode responder aqui; mensagens internas da equipa não são mostradas.
          </p>
          {msgLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {messages.map((m) => (
                <li key={m.id} className="rounded-lg bg-zinc-900/80 px-3 py-2 text-sm">
                  <span className="text-xs text-zinc-500">
                    {(m.user.name || m.user.email || 'Equipa') + ' · '}
                    {new Date(m.createdAt).toLocaleString('pt-BR')}
                  </span>
                  <p className="text-zinc-200 whitespace-pre-wrap mt-1">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <textarea
              value={msgDraft}
              onChange={(e) => setMsgDraft(e.target.value)}
              rows={2}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white"
              placeholder="Escreva uma mensagem…"
            />
            <button
              type="button"
              onClick={sendMessage}
              className="self-end rounded-lg bg-zinc-700 px-3 py-2 text-sm text-white"
            >
              Enviar
            </button>
          </div>

          {evidenceList.length > 0 ? (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Evidências</p>
              <div className="flex flex-wrap gap-2">
                {evidenceList.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-violet-400 hover:underline"
                  >
                    Abrir ficheiro
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-zinc-600">
        Preferência também por{' '}
        <Link href="/dashboard/cliente/contestacoes" className="text-violet-400 hover:underline">
          contestações
        </Link>{' '}
        para outros tipos de pedido.
      </p>
    </div>
  )
}
