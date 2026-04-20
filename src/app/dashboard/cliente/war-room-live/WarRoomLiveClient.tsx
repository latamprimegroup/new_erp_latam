'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Loader2, MessageCircle, Radio, Send, Shield, Sparkles, Video } from 'lucide-react'

type Overview = {
  liveConfig: {
    mode: string
    embedUrl?: string
    joinUrl?: string
    schedule: Array<{ title: string; time: string; host?: string }>
  }
  trustLevelStars: number | null
  preflights: Array<{
    id: string
    campaignUrl: string
    status: string
    statusLabel: string
    checklistJson: unknown
    analystNotes: string | null
    ticketNumber: string | null
    createdAt: string
  }>
  leaderboard: Array<{ rank: number; alias: string; avgRoi: number; isYou: boolean }>
  mentorAuxiliar: { active: boolean; label: string | null }
  openaiConfigured: boolean
}

type ChatMsg = { id: string; body: string; kind: string; createdAt: string; author: string }

export function WarRoomLiveClient() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [prefUrl, setPrefUrl] = useState('')
  const [prefNotes, setPrefNotes] = useState('')
  const [prefBusy, setPrefBusy] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiThread, setAiThread] = useState<Array<{ role: 'user' | 'alfredo'; text: string }>>([])
  const chatEnd = useRef<HTMLDivElement>(null)

  const loadOverview = useCallback(() => {
    fetch('/api/cliente/war-room-live/overview')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<Overview>
      })
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false))
  }, [])

  const loadChat = useCallback(() => {
    fetch('/api/cliente/war-room-live/chat')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.messages) setChat(j.messages)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  useEffect(() => {
    loadChat()
    const id = setInterval(loadChat, 5000)
    return () => clearInterval(id)
  }, [loadChat])

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chat])

  async function sendChat(e: FormEvent) {
    e.preventDefault()
    if (!chatInput.trim()) return
    setChatBusy(true)
    try {
      const r = await fetch('/api/cliente/war-room-live/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: chatInput.trim() }),
      })
      if (!r.ok) throw new Error('send')
      setChatInput('')
      loadChat()
    } catch {
      alert('Não foi possível enviar')
    } finally {
      setChatBusy(false)
    }
  }

  async function requestScreen() {
    setChatBusy(true)
    try {
      await fetch('/api/cliente/war-room-live/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: 'Pedido: partilha de ecrã para revisão de campanha em tempo real.',
          kind: 'screen_request',
        }),
      })
      loadChat()
    } finally {
      setChatBusy(false)
    }
  }

  async function submitPreflight(e: FormEvent) {
    e.preventDefault()
    setPrefBusy(true)
    try {
      const r = await fetch('/api/cliente/war-room-live/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignUrl: prefUrl.trim(), notes: prefNotes.trim() || undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setPrefUrl('')
      setPrefNotes('')
      loadOverview()
      alert(`Enviado — ${j.ticketNumber}. Estado: em análise pelo especialista.`)
    } catch (ex: unknown) {
      alert(ex instanceof Error ? ex.message : 'Erro')
    } finally {
      setPrefBusy(false)
    }
  }

  async function askAlfredo(e: FormEvent) {
    e.preventDefault()
    if (!aiInput.trim()) return
    const q = aiInput.trim()
    setAiInput('')
    setAiThread((t) => [...t, { role: 'user', text: q }])
    setAiBusy(true)
    try {
      const r = await fetch('/api/cliente/war-room-live/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro')
      setAiThread((t) => [...t, { role: 'alfredo', text: j.reply }])
    } catch {
      setAiThread((t) => [...t, { role: 'alfredo', text: 'Falha temporária. Usa o Suporte VIP ou abre ticket.' }])
    } finally {
      setAiBusy(false)
    }
  }

  async function openTicketFromAi() {
    const lastUser = [...aiThread].reverse().find((m) => m.role === 'user')
    const lastBot = [...aiThread].reverse().find((m) => m.role === 'alfredo')
    if (!lastUser) return
    const desc = [
      'Escalação War Room — Alfredo',
      '',
      'Pergunta:',
      lastUser.text,
      '',
      'Resposta IA:',
      lastBot?.text || '—',
    ].join('\n')
    const r = await fetch('/api/cliente/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: '[War Room] Escalação após Alfredo IA',
        description: desc,
        category: 'DUVIDA',
        priority: 'HIGH',
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      alert(j.error || 'Erro ao criar ticket')
      return
    }
    alert(`Ticket criado: ${j.ticket?.ticketNumber || 'OK'}`)
  }

  if (loading && !overview) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    )
  }

  if (!overview) {
    return <p className="p-8 text-red-600">Não foi possível carregar a War Room.</p>
  }

  const cfg = overview.liveConfig

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <div>
        <p className="text-sm font-medium text-primary-600 dark:text-primary-400 flex items-center gap-2">
          <Radio className="w-4 h-4" />
          Módulo 05 — War Room Live &amp; Suporte Concierge
        </p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Central de comando</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
          Live, chat da sala, pré-flight, Alfredo IA e ranking da comunidade. O botão <strong>Suporte VIP</strong> está sempre
          disponível no canto inferior direito.
        </p>
        <div className="flex flex-wrap gap-3 mt-3 text-xs">
          {overview.trustLevelStars != null && (
            <span className="rounded-full bg-gray-100 dark:bg-white/10 px-3 py-1">
              Nível operacional (interno): {overview.trustLevelStars}/5
            </span>
          )}
          {overview.mentorAuxiliar.active && (
            <span className="rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100 px-3 py-1 font-semibold">
              {overview.mentorAuxiliar.label}
            </span>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 overflow-hidden">
        <div className="border-b border-gray-100 dark:border-white/10 px-4 py-3 flex items-center gap-2">
          <Video className="w-5 h-5 text-red-500" />
          <h2 className="font-semibold text-gray-900 dark:text-white">Live agora &amp; cronograma</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-0 md:divide-x divide-gray-100 dark:divide-white/10">
          <div className="p-4 min-h-[220px] bg-black/90">
            {cfg.mode === 'youtube' && cfg.embedUrl ? (
              <iframe
                title="Live"
                src={cfg.embedUrl}
                className="w-full aspect-video rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : cfg.mode === 'zoom' && cfg.joinUrl ? (
              <div className="flex flex-col items-center justify-center h-full text-white text-center p-4">
                <p className="text-sm mb-4">Sala Zoom / vídeo conferência</p>
                <a
                  href={cfg.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium"
                >
                  Entrar na sala
                </a>
              </div>
            ) : cfg.mode === 'custom' && cfg.joinUrl ? (
              <div className="flex flex-col items-center justify-center h-full text-white text-center p-4">
                <a href={cfg.joinUrl} target="_blank" rel="noreferrer" className="text-primary-300 underline text-sm">
                  Abrir transmissão
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm text-center px-4">
                Transmissão configurada pela equipa (YouTube embed ou Zoom). Até lá, usa o chat e o Concierge VIP.
              </div>
            )}
          </div>
          <div className="p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Cronograma</h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              {cfg.schedule.map((s, i) => (
                <li key={i} className="border-l-2 border-primary-500 pl-3">
                  <span className="font-medium text-gray-900 dark:text-white">{s.title}</span>
                  <span className="block text-xs">{s.time}</span>
                  {s.host && <span className="text-xs text-gray-500">— {s.host}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Chat ao vivo da sala
          </h2>
          <button
            type="button"
            onClick={requestScreen}
            disabled={chatBusy}
            className="text-xs rounded-lg border border-gray-300 dark:border-white/15 px-2 py-1"
          >
            Pedir revisão com partilha de ecrã
          </button>
        </div>
        <div className="h-56 overflow-y-auto rounded-lg bg-gray-50 dark:bg-black/40 p-3 text-sm space-y-2">
          {chat.map((m) => (
            <div key={m.id} className={m.kind === 'screen_request' ? 'text-amber-700 dark:text-amber-300' : ''}>
              <span className="font-semibold text-gray-700 dark:text-gray-300">{m.author}:</span>{' '}
              <span className="text-gray-800 dark:text-gray-200">{m.body}</span>
            </div>
          ))}
          <div ref={chatEnd} />
        </div>
        <form onSubmit={sendChat} className="flex gap-2 mt-2">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Mensagem para a sala..."
            className="flex-1 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
          />
          <button
            type="submit"
            disabled={chatBusy}
            className="rounded-lg bg-primary-600 text-white p-2 disabled:opacity-50"
            aria-label="Enviar"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-4 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Pré-flight (revisão antes do play)
        </h2>
        <form onSubmit={submitPreflight} className="grid gap-3 sm:grid-cols-2">
          <input
            required
            type="url"
            value={prefUrl}
            onChange={(e) => setPrefUrl(e.target.value)}
            placeholder="Link da campanha / conjunto / anúncio"
            className="sm:col-span-2 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
          />
          <textarea
            value={prefNotes}
            onChange={(e) => setPrefNotes(e.target.value)}
            placeholder="Notas (opcional)"
            rows={2}
            className="sm:col-span-2 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
          />
          <button
            type="submit"
            disabled={prefBusy}
            className="sm:col-span-2 inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {prefBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            Submeter para análise
          </button>
        </form>
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Os teus pedidos</h3>
          {overview.preflights.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum ainda.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {overview.preflights.map((p) => (
                <li key={p.id} className="rounded-lg border border-gray-100 dark:border-white/10 p-3">
                  <p className="text-xs text-gray-500">{p.statusLabel}</p>
                  <p className="font-mono text-xs break-all mt-1">{p.campaignUrl}</p>
                  {p.ticketNumber && (
                    <p className="text-xs mt-1">
                      Ticket: <Link href="/dashboard/cliente/suporte" className="text-primary-600 underline">{p.ticketNumber}</Link>
                    </p>
                  )}
                  {Array.isArray(p.checklistJson) && p.checklistJson.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {(p.checklistJson as { label?: string; status?: string }[]).map((c, i) => (
                        <li key={i}>
                          [{c.status === 'ok' ? 'OK' : c.status === 'adjust' ? 'Ajustar' : '—'}] {c.label}
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.analystNotes && <p className="text-xs mt-2 text-gray-600 dark:text-gray-400">{p.analystNotes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Alfredo IA — base de conhecimento
        </h2>
        <p className="text-xs text-gray-500">
          {overview.openaiConfigured
            ? 'Motor OpenAI ativo (gpt-4o-mini por defeito).'
            : 'Modo offline: respostas por FAQ. Configura OPENAI_API_KEY para respostas completas.'}
        </p>
        <div className="h-48 overflow-y-auto rounded-lg bg-gray-50 dark:bg-black/40 p-3 text-sm space-y-2">
          {aiThread.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <span className="text-xs text-gray-500">{m.role === 'user' ? 'Tu' : 'Alfredo'}</span>
              <p className="whitespace-pre-wrap">{m.text}</p>
            </div>
          ))}
          {aiBusy && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>
        <form onSubmit={askAlfredo} className="flex gap-2">
          <input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Ex.: Como troco o domínio da minha UNI 04?"
            className="flex-1 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
          />
          <button type="submit" disabled={aiBusy} className="rounded-lg bg-gray-900 dark:bg-white dark:text-black text-white px-3 py-2 text-sm">
            Perguntar
          </button>
        </form>
        <button type="button" onClick={openTicketFromAi} className="text-xs text-primary-600 dark:text-primary-400 underline">
          Abrir ticket humano com este contexto
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Comunidade — mentores auxiliares (ROI Creative Vault, ~60d)
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Ranking anónimo para incentivar partilha. Top 5 com ROI elevado podem receber o selo «Mentor auxiliar».
        </p>
        <ol className="space-y-2 text-sm">
          {overview.leaderboard.length === 0 ? (
            <li className="text-gray-500">Sem dados de métricas ainda — usa o Creative Vault para registar ROI.</li>
          ) : (
            overview.leaderboard.map((row) => (
              <li
                key={row.rank}
                className={`flex justify-between rounded-lg px-3 py-2 ${row.isYou ? 'bg-primary-50 dark:bg-primary-950/30' : 'bg-gray-50 dark:bg-white/5'}`}
              >
                <span>
                  #{row.rank} {row.alias} {row.isYou && '(tu)'}
                </span>
                <span className="font-mono text-xs">ROI médio {row.avgRoi}</span>
              </li>
            ))
          )}
        </ol>
      </section>

      <Link href="/dashboard/cliente/suporte" className="text-sm text-primary-600 dark:text-primary-400 underline inline-block">
        Ver todos os tickets e ordens de serviço
      </Link>
    </div>
  )
}
