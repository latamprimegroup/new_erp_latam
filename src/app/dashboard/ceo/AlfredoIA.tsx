'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bot, Send, Loader2, Zap, Target, Trash2, RefreshCw,
  Pin, AlertTriangle, CheckCircle2, BarChart2, Brain, Star,
  ChevronDown, ChevronUp, Sparkles, X, Copy, Volume2,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: string; ts: number }

type Briefing = {
  summary: string
  alerts:  { type: 'DANGER'|'WARNING'|'OK'; message: string }[]
  topTask?: string
  esquecidos?: string[]
  revenue?: number
  marginPct?: number
  noAI?: boolean
  fresh: boolean
}

type Opportunity = {
  type:             'ELIMINAR' | 'AUTOMATIZAR' | 'ESCALAR' | 'URGENTE'
  title:            string
  description:      string
  estimatedImpact:  string
}

type Efficiency = {
  score:            number
  diagnosis:        string
  opportunities:    Opportunity[]
  automationScript: string | null
  rawInsights?:     Record<string, number>
  noAI?:            boolean
  suggestions?:     string[]
}

type Verdict = 'EXECUTAR_AGORA' | 'AUTOMATIZAR' | 'DELEGAR' | 'ELIMINAR'
type Analysis = {
  verdict:         Verdict
  justificativa:   string
  techSuggestion:  string | null
  revenueImpact:   string
  taskTitle:       string
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuais
// ─────────────────────────────────────────────────────────────────────────────

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; bg: string; border: string }> = {
  EXECUTAR_AGORA: { label: 'Executar Agora', color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300' },
  AUTOMATIZAR:    { label: 'Automatizar',    color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300'  },
  DELEGAR:        { label: 'Delegar',        color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-300' },
  ELIMINAR:       { label: 'Eliminar',       color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'   },
}

const OPP_CONFIG: Record<string, { badge: string; icon: React.ReactNode }> = {
  URGENTE:     { badge: 'bg-red-100 text-red-700',    icon: <AlertTriangle className="w-3 h-3" /> },
  ELIMINAR:    { badge: 'bg-zinc-100 text-zinc-600',  icon: <Trash2 className="w-3 h-3" /> },
  AUTOMATIZAR: { badge: 'bg-blue-100 text-blue-700',  icon: <Zap className="w-3 h-3" /> },
  ESCALAR:     { badge: 'bg-green-100 text-green-700',icon: <Target className="w-3 h-3" /> },
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function copyText(text: string) { navigator.clipboard.writeText(text).catch(() => null) }

function MarkdownText({ text }: { text: string }) {
  // Bold, code, bullet simples
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5 leading-relaxed">
      {lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        return (
          <p key={i}>
            {parts.map((p, j) =>
              p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong>
              : p.startsWith('`') ? <code key={j} className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded text-xs font-mono">{p.slice(1, -1)}</code>
              : p
            )}
          </p>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Briefing Card
// ─────────────────────────────────────────────────────────────────────────────

function BriefingCard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [loading, setLoading]   = useState(true)
  const [open, setOpen]         = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/alfredo/briefing')
    if (r.ok) setBriefing(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-4 flex items-center gap-3 bg-white dark:bg-ads-dark-card">
      <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
      <span className="text-sm text-zinc-500">Alfredo preparando seu briefing matinal...</span>
    </div>
  )

  if (!briefing) return null

  const alertColor = briefing.alerts?.some((a) => a.type === 'DANGER') ? 'border-red-300 bg-red-50 dark:bg-red-950/10'
    : briefing.alerts?.some((a) => a.type === 'WARNING') ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/10'
    : 'border-green-300 bg-green-50 dark:bg-green-950/10'

  return (
    <div className={`rounded-2xl border ${alertColor} overflow-hidden`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:opacity-80 transition-opacity">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase">Briefing Matinal — ALFREDO IA</p>
          {briefing.topTask && <p className="text-sm font-bold text-zinc-800 dark:text-zinc-200 truncate">🎯 {briefing.topTask}</p>}
        </div>
        <div className="flex items-center gap-2">
          {briefing.revenue && (
            <span className="hidden sm:block text-xs font-mono text-zinc-500">{BRL(Number(briefing.revenue))}</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); load() }} className="p-1 rounded hover:bg-white/50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{briefing.summary}</p>

          {briefing.alerts && briefing.alerts.length > 0 && (
            <div className="space-y-1.5">
              {briefing.alerts.map((a, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${a.type === 'DANGER' ? 'bg-red-100 text-red-700' : a.type === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                  {a.type === 'DANGER' ? '🚨' : a.type === 'WARNING' ? '⚠️' : '✅'} {a.message}
                </div>
              ))}
            </div>
          )}

          {briefing.esquecidos && briefing.esquecidos.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/10 px-3 py-2">
              <p className="text-xs font-bold text-amber-700 mb-1">📌 Não Esquecer:</p>
              <ul className="space-y-0.5">
                {briefing.esquecidos.map((e, i) => <li key={i} className="text-xs text-amber-600">• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Efficiency Scanner
// ─────────────────────────────────────────────────────────────────────────────

function EfficiencyScanner() {
  const [data, setData]       = useState<Efficiency | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCode, setShowCode] = useState(false)

  const run = async () => {
    setLoading(true)
    const r = await fetch('/api/admin/alfredo/efficiency')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }

  const scoreColor = (s: number) => s >= 75 ? 'text-green-600' : s >= 50 ? 'text-amber-500' : 'text-red-600'
  const scoreBg    = (s: number) => s >= 75 ? 'bg-green-100' : s >= 50 ? 'bg-amber-100' : 'bg-red-100'

  return (
    <div className="space-y-4">
      {!data && !loading && (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-8 text-center">
          <BarChart2 className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="font-bold text-zinc-700 dark:text-zinc-300 mb-1">Scanner de Eficiência Operacional</p>
          <p className="text-sm text-zinc-400 mb-4">A ALFREDO IA varre o ERP inteiro e identifica gargalos, capital morto e oportunidades de automação.</p>
          <button onClick={run} className="btn-primary flex items-center gap-2 mx-auto">
            <Sparkles className="w-4 h-4" />Rodar Diagnóstico
          </button>
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 p-8 text-center bg-white dark:bg-ads-dark-card">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-3" />
          <p className="text-sm text-zinc-500">Analisando toda a operação... isso pode levar alguns segundos.</p>
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Score */}
          <div className={`rounded-2xl p-4 flex items-center gap-4 ${scoreBg(data.score)}`}>
            <div className="text-center shrink-0">
              <p className={`text-5xl font-black ${scoreColor(data.score)}`}>{data.score}</p>
              <p className="text-xs text-zinc-500 font-semibold">/100</p>
            </div>
            <div>
              <p className="font-bold text-zinc-800 mb-1">Saúde Operacional</p>
              <p className="text-sm text-zinc-600 leading-relaxed">{data.diagnosis}</p>
            </div>
            <button onClick={run} className="ml-auto p-2 rounded-xl hover:bg-white/60 transition-colors shrink-0">
              <RefreshCw className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* Raw insights */}
          {data.rawInsights && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'OS Bloqueadas', val: data.rawInsights.blockedOrders, bad: true },
                { label: 'Receita Bloqueada', val: BRL(data.rawInsights.blockedRevenue ?? 0), bad: (data.rawInsights.blockedRevenue ?? 0) > 0 },
                { label: 'Em Triagem >7d', val: data.rawInsights.triagem, bad: true },
                { label: 'Capital Morto (>30d)', val: data.rawInsights.deadStock, bad: true },
              ].map((m) => (
                <div key={m.label} className={`rounded-xl border px-3 py-2 text-center ${m.val && m.bad ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white dark:bg-ads-dark-card dark:border-zinc-700'}`}>
                  <p className={`text-lg font-black ${m.val && m.bad ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-200'}`}>{m.val}</p>
                  <p className="text-[10px] text-zinc-500">{m.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Oportunidades */}
          {data.opportunities && data.opportunities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-zinc-500 uppercase px-1">Oportunidades Identificadas</p>
              {data.opportunities.map((o, i) => {
                const cfg = OPP_CONFIG[o.type] ?? OPP_CONFIG.AUTOMATIZAR
                return (
                  <div key={i} className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3 flex items-start gap-3">
                    <span className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${cfg.badge}`}>
                      {cfg.icon}{o.type}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-bold">{o.title}</p>
                      <p className="text-xs text-zinc-500">{o.description}</p>
                    </div>
                    <span className="shrink-0 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-lg">{o.estimatedImpact}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Automation Script */}
          {data.automationScript && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5"><Zap className="w-3.5 h-3.5" />Sugestão de Automação</p>
                <div className="flex gap-1">
                  <button onClick={() => copyText(data.automationScript!)} className="p-1 rounded hover:bg-blue-100 transition-colors"><Copy className="w-3 h-3 text-blue-500" /></button>
                  <button onClick={() => setShowCode((v) => !v)} className="p-1 rounded hover:bg-blue-100 transition-colors">{showCode ? <ChevronUp className="w-3 h-3 text-blue-500" /> : <ChevronDown className="w-3 h-3 text-blue-500" />}</button>
                </div>
              </div>
              {showCode && <pre className="text-xs font-mono bg-white dark:bg-zinc-900 rounded-lg p-3 overflow-auto whitespace-pre-wrap text-blue-800 dark:text-blue-300">{data.automationScript}</pre>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Principal
// ─────────────────────────────────────────────────────────────────────────────

function AlfredoChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [streaming, setStreaming] = useState(false)
  const [noKey, setNoKey]       = useState(false)
  const [quickNote, setQuickNote] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)

  const STARTERS = [
    'Qual é o maior gargalo para eu chegar nos R$1M?',
    'Onde estou perdendo margem agora?',
    'Analisa meu burn rate e sugere cortes',
    'Quais tarefas eu devo eliminar esta semana?',
    'Como automatizar a triagem de ativos?',
  ]

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  const send = async (msg = input) => {
    if (!msg.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: msg.trim(), ts: Date.now() }
    const updatedHistory   = [...messages, userMsg]
    setMessages(updatedHistory)
    setInput('')
    setStreaming(true)

    const assistantMsg: Message = { role: 'assistant', content: '', ts: Date.now() }
    setMessages((prev) => [...prev, assistantMsg])

    try {
      const r = await fetch('/api/admin/alfredo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message: msg.trim(),
          history: updatedHistory.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!r.ok) {
        const j = await r.json()
        if (j.setup) setNoKey(true)
        setMessages((prev) => {
          const copy = [...prev]
          copy[copy.length - 1] = { ...assistantMsg, content: j.error || 'Erro desconhecido' }
          return copy
        })
        setStreaming(false)
        return
      }

      const reader  = r.body?.getReader()
      const decoder = new TextDecoder()
      let   full    = ''

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        const lines = text.split('\n').filter((l) => l.startsWith('data:'))
        for (const line of lines) {
          const data = line.replace('data: ', '').trim()
          if (data === '[DONE]') break
          try {
            const { delta, error } = JSON.parse(data)
            if (error) { full += `\n[Erro: ${error}]`; break }
            if (delta) {
              full += delta
              setMessages((prev) => {
                const copy = [...prev]; copy[copy.length - 1] = { ...assistantMsg, content: full }; return copy
              })
            }
          } catch { /* ignora chunks incompletos */ }
        }
        scrollToBottom()
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev]; copy[copy.length - 1] = { ...assistantMsg, content: `Erro de conexão: ${err instanceof Error ? err.message : 'desconhecido'}` }; return copy
      })
    }

    setStreaming(false)
    scrollToBottom()
    inputRef.current?.focus()
  }

  const saveNote = async () => {
    if (!quickNote.trim()) return
    await fetch('/api/admin/alfredo/memory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'NOTE', content: quickNote, pinned: false }),
    })
    setQuickNote('')
  }

  return (
    <div className="flex flex-col h-full min-h-[500px]">
      {/* Configuração Key */}
      {noKey && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 mb-3 text-sm">
          <p className="font-bold text-amber-800 mb-1">⚙️ OPENAI_API_KEY não configurada</p>
          <p className="text-amber-700 text-xs">Adicione <code className="bg-amber-100 px-1 rounded">OPENAI_API_KEY=sk-...</code> no arquivo <code className="bg-amber-100 px-1 rounded">.env.local</code> e reinicie o servidor.</p>
          <p className="text-amber-600 text-xs mt-1">Modelos suportados: gpt-4o-mini (padrão), gpt-4o. Adicione <code className="bg-amber-100 px-1 rounded">OPENAI_MODEL=gpt-4o</code> para usar o GPT-4o completo.</p>
        </div>
      )}

      {/* Histórico */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[300px] max-h-[450px]">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto shadow-lg">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <p className="font-black text-lg">ALFREDO IA</p>
              <p className="text-sm text-zinc-500">Co-Piloto de Decisões do CEO — Road to R$1M</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 max-w-md mx-auto">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-left text-xs px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-zinc-600 dark:text-zinc-400">
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === 'user' ? 'bg-primary-600 text-white rounded-br-sm' : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-bl-sm'}`}>
              {m.role === 'assistant' ? (
                <div className="space-y-1">
                  <MarkdownText text={m.content || '...'} />
                  {m.content && (
                    <button onClick={() => copyText(m.content)} className="mt-2 opacity-40 hover:opacity-100 transition-opacity">
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <p>{m.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 space-y-2">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Pergunte à ALFREDO IA... (Enter para enviar, Shift+Enter para nova linha)"
            rows={2}
            className="flex-1 input-field resize-none text-sm"
            disabled={streaming}
          />
          <button onClick={() => send()} disabled={!input.trim() || streaming}
            className="btn-primary p-3 rounded-xl self-end shrink-0 disabled:opacity-50">
            {streaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        {/* Quick Note */}
        <div className="flex gap-2">
          <input value={quickNote} onChange={(e) => setQuickNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveNote() }}
            placeholder="📌 Salvar nota na memória da ALFREDO (Enter)..."
            className="flex-1 input-field text-xs py-2" />
          <button onClick={saveNote} disabled={!quickNote.trim()} className="btn-secondary px-3 text-xs py-2 flex items-center gap-1">
            <Pin className="w-3 h-3" />Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente exportado — composição das abas
// ─────────────────────────────────────────────────────────────────────────────

type AlfredoTab = 'chat' | 'scanner' | 'memory'

export function AlfredoIA({ taskToAnalyze, onAnalysisDone }: {
  taskToAnalyze?: { id: string; title: string } | null
  onAnalysisDone?: (result: Analysis) => void
}) {
  const [tab, setTab]         = useState<AlfredoTab>('chat')
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  const runAnalysis = useCallback(async () => {
    if (!taskToAnalyze) return
    setAnalyzing(true)
    const r = await fetch('/api/admin/alfredo/analyze', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ taskId: taskToAnalyze.id }),
    })
    if (r.ok) {
      const result = await r.json()
      setAnalysis(result)
      onAnalysisDone?.(result)
    }
    setAnalyzing(false)
  }, [taskToAnalyze, onAnalysisDone])

  useEffect(() => { if (taskToAnalyze) { setTab('chat'); runAnalysis() } }, [taskToAnalyze, runAnalysis])

  const TABS: { id: AlfredoTab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat',    label: 'Chat',    icon: <Bot className="w-3.5 h-3.5" />    },
    { id: 'scanner', label: 'Scanner', icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: 'memory',  label: 'Memória', icon: <Brain className="w-3.5 h-3.5" />  },
  ]

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-700 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-black text-sm">ALFREDO IA</h2>
          <p className="text-[10px] text-zinc-400">Co-Piloto de Decisões CEO · War Room OS</p>
        </div>
        <div className="ml-auto flex gap-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${tab === t.id ? 'bg-primary-600 text-white' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Analysis Result Banner */}
      {(analyzing || analysis) && (
        <div className={`px-4 py-3 border-b ${analysis ? VERDICT_CONFIG[analysis.verdict].border + ' ' + VERDICT_CONFIG[analysis.verdict].bg : 'border-zinc-100 bg-zinc-50'}`}>
          {analyzing ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analisando "{taskToAnalyze?.title}"...
            </div>
          ) : analysis && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${VERDICT_CONFIG[analysis.verdict].color} bg-white border ${VERDICT_CONFIG[analysis.verdict].border}`}>
                  ⚡ {VERDICT_CONFIG[analysis.verdict].label}
                </span>
                <span className="text-xs font-semibold text-zinc-600 truncate">{analysis.taskTitle}</span>
                <button onClick={() => setAnalysis(null)} className="ml-auto"><X className="w-3.5 h-3.5 text-zinc-400" /></button>
              </div>
              <p className="text-xs text-zinc-700 dark:text-zinc-300">{analysis.justificativa}</p>
              {analysis.techSuggestion && (
                <p className="text-xs text-blue-700 bg-blue-50 px-2 py-1.5 rounded-lg">💻 {analysis.techSuggestion}</p>
              )}
              <p className="text-xs font-semibold text-primary-600">💰 {analysis.revenueImpact}</p>
            </div>
          )}
        </div>
      )}

      {/* Conteúdo das abas */}
      <div className="p-4">
        {tab === 'chat'    && <AlfredoChat />}
        {tab === 'scanner' && <EfficiencyScanner />}
        {tab === 'memory'  && <MemoryPanel />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel de Memória
// ─────────────────────────────────────────────────────────────────────────────

type Memory = { id: string; type: string; title: string | null; content: string; pinned: boolean; createdAt: string }

function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/admin/alfredo/memory')
    if (r.ok) setMemories(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const del = async (id: string) => {
    await fetch(`/api/admin/alfredo/memory?id=${id}`, { method: 'DELETE' })
    setMemories((prev) => prev.filter((m) => m.id !== id))
  }

  const TYPE_COLORS: Record<string, string> = {
    NOTE:          'bg-zinc-100 text-zinc-600',
    INSIGHT:       'bg-purple-100 text-purple-700',
    TASK_ANALYSIS: 'bg-blue-100 text-blue-700',
    BRIEFING:      'bg-amber-100 text-amber-700',
    CHAT_SUMMARY:  'bg-green-100 text-green-700',
  }

  const filtered = memories.filter((m) =>
    !filter || m.content.toLowerCase().includes(filter.toLowerCase()) || (m.title ?? '').toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar na memória da ALFREDO..."
          className="input-field flex-1 text-sm py-2" />
        <button onClick={load} className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50">
          <RefreshCw className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-zinc-400" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-zinc-400 py-8">Nenhuma memória salva. Converse com a ALFREDO IA para gerar insights.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {m.pinned && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TYPE_COLORS[m.type] ?? 'bg-zinc-100 text-zinc-600'}`}>{m.type}</span>
                  {m.title && <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{m.title}</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => copyText(m.content)} className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                    <Copy className="w-3 h-3 text-zinc-400" />
                  </button>
                  <button onClick={() => del(m.id)} className="p-1 rounded hover:bg-red-50 transition-colors">
                    <Trash2 className="w-3 h-3 text-zinc-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">{m.content}</p>
              <p className="text-[10px] text-zinc-400 mt-1">{new Date(m.createdAt).toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
