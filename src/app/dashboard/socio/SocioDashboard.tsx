'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CaixaForteWidget, ProjecaoBilhaoWidget, CostAuditorWidget } from './WealthWidgets'
import {
  Shield, TrendingUp, TrendingDown, Home, Car, Bitcoin, BarChart2,
  Plus, X, Edit3, Loader2, Zap, DollarSign, Target, Clock,
  Star, Building2, PiggyBank, Briefcase, AlertTriangle, CheckCircle2,
  Upload, MessageSquare, RotateCcw, ChevronDown, ChevronRight, Sparkles,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type Profile = {
  id: string; targetWealth: number | null; monthlyExpenseGoal: number | null; notes: string | null
  assets: Asset[]; transfers: Transfer[]
}
type Summary = {
  totalPatrimonio: number; monthlyIncome: number; monthlyExpense: number
  monthlyBalance: number; netSavings: number; targetProgress: number | null; targetWealth: number
}
type Asset = {
  id: string; type: string; name: string; currentValue: number; currency: string
  acquiredValue: number | null; acquiredAt: string | null; notes: string | null
}
type Entry = {
  id: string; type: string; category: string; amount: number; currency: string
  date: string; description: string | null; paymentMethod: string | null; aiExtracted: boolean
}
type Transfer = {
  id: string; type: string; amount: number; date: string; notes: string | null
  approvedBy: { name: string | null } | null
}
type Runway = {
  runwayMonths: number; runwayYears: number; independenceScore: number
  avgMonthlyExpense: number; totalPatrimonio: number; targetWealth: number
  targetProgress: number | null; companyProfit: number; suggestedWithdrawal: number
  aiSuggestion: string | null
  monthlyHistory: { month: string; income: number; expense: number; balance: number }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const PCT = (v: number) => `${v.toFixed(1)}%`

const ASSET_ICON: Record<string, React.ReactNode> = {
  IMOVEL:            <Home className="w-4 h-4" />,
  VEICULO:           <Car className="w-4 h-4" />,
  CRIPTO:            <Bitcoin className="w-4 h-4" />,
  ACOES:             <TrendingUp className="w-4 h-4" />,
  FUNDO_INVESTIMENTO: <BarChart2 className="w-4 h-4" />,
  CONTA_BANCARIA:    <DollarSign className="w-4 h-4" />,
  PREVIDENCIA:       <PiggyBank className="w-4 h-4" />,
  OUTRO:             <Briefcase className="w-4 h-4" />,
}
const ASSET_LABEL: Record<string, string> = {
  IMOVEL:'Imóvel', VEICULO:'Veículo', CRIPTO:'Cripto', ACOES:'Ações/BDR',
  FUNDO_INVESTIMENTO:'Fundo', CONTA_BANCARIA:'Conta Bancária', PREVIDENCIA:'Previdência', OUTRO:'Outro',
}
const CAT_LABEL: Record<string, string> = {
  MORADIA:'🏠 Moradia', ALIMENTACAO:'🍽 Alimentação', LAZER:'🎭 Lazer', SAUDE:'💊 Saúde',
  EDUCACAO:'📚 Educação', TRANSPORTE:'🚗 Transporte', INVESTIMENTO_EXTERNO:'📈 Investimento',
  IMPOSTO_PESSOAL:'🧾 Impostos PF', PRO_LABORE:'💼 Pró-labore', DISTRIBUICAO_LUCRO:'💰 Dist. Lucro',
  ADIANTAMENTO:'⏩ Adiantamento', REEMBOLSO_EMPRESA:'↩️ Reembolso', OUTRO:'📌 Outro',
}

// ─────────────────────────────────────────────────────────────────────────────
// Gauge de independência financeira
// ─────────────────────────────────────────────────────────────────────────────

function IndependenceGauge({ score, years }: { score: number; years: number }) {
  const r = 52; const c = 2 * Math.PI * r
  const offset = c * (1 - score / 100)
  const color  = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="130" height="80" viewBox="0 0 130 80">
        <path d="M 15 70 A 52 52 0 0 1 115 70" fill="none" stroke="#e4e4e7" strokeWidth="12" strokeLinecap="round" />
        <path d="M 15 70 A 52 52 0 0 1 115 70" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c / 2} strokeDashoffset={offset / 2} style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x="65" y="65" textAnchor="middle" fill={color} fontSize="22" fontWeight="900">{score}</text>
      </svg>
      <p className="text-xs text-zinc-500 text-center">
        <span className="font-bold text-zinc-700 dark:text-zinc-200">Runway: {years.toFixed(1)} anos</span><br />Score de Independência
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Target Wealth Progress
// ─────────────────────────────────────────────────────────────────────────────

function TargetBar({ current, target, progress }: { current: number; target: number; progress: number | null }) {
  if (!target) return null
  const pct = Math.min(100, progress ?? 0)
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-500">Meta: <strong>{BRL(target)}</strong></span>
        <span className="font-bold text-primary-600">{PCT(pct)} atingido</span>
      </div>
      <div className="h-3 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-primary-500 to-primary-700 rounded-full transition-all"
          style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-zinc-400 text-right">Atual: {BRL(current)}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline de histórico
// ─────────────────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: { month: string; income: number; expense: number; balance: number }[] }) {
  const max = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1)
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-1.5 h-20">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex gap-0.5 items-end" style={{ height: '64px' }}>
              <div className="flex-1 bg-green-400 rounded-t-sm opacity-80" style={{ height: `${Math.max(2, (d.income / max) * 64)}px` }} />
              <div className="flex-1 bg-red-400 rounded-t-sm opacity-80"   style={{ height: `${Math.max(2, (d.expense / max) * 64)}px` }} />
            </div>
            <p className="text-[8px] text-zinc-400">{d.month}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-sm" />Receita</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-400 rounded-sm"   />Despesa</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fast-Entry pessoal
// ─────────────────────────────────────────────────────────────────────────────

function PersonalFastEntry({ onSaved }: { onSaved: () => void }) {
  const [mode,  setMode]  = useState<'text' | 'image'>('text')
  const [type,  setType]  = useState<'RECEITA' | 'DESPESA'>('DESPESA')
  const [text,  setText]  = useState('')
  const [img,   setImg]   = useState<string | null>(null)
  const [proc,  setProc]  = useState(false)
  const [draft, setDraft] = useState<{ amount: number | null; category: string; description: string; confidence: number } | null>(null)
  const [err,   setErr]   = useState('')
  const [ok,    setOk]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const process = async () => {
    if (!text.trim() && !img) { setErr('Forneça texto ou imagem'); return }
    setProc(true); setErr('')
    const r = await fetch('/api/socio/fast-entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || undefined, imageBase64: img || undefined, type, confirm: false }),
    })
    if (r.ok) { const j = await r.json(); setDraft(j.extracted) }
    else { const j = await r.json(); setErr(j.error ?? 'Erro ao processar') }
    setProc(false)
  }

  const confirm = async () => {
    if (!draft?.amount) return
    setProc(true)
    const r = await fetch('/api/socio/fast-entry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text || undefined, imageBase64: img || undefined, type, confirm: true }),
    })
    if (r.ok) { setOk(true); setTimeout(() => { setOk(false); setDraft(null); setText(''); setImg(null); onSaved() }, 1500) }
    else { const j = await r.json(); setErr(j.error ?? 'Erro ao confirmar') }
    setProc(false)
  }

  if (ok) return (
    <div className="text-center py-6 space-y-2">
      <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
      <p className="font-bold text-green-700">Lançado no seu controle pessoal!</p>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Tipo */}
      <div className="flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        {(['DESPESA', 'RECEITA'] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${type === t ? (t === 'RECEITA' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-zinc-400'}`}>
            {t === 'RECEITA' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {t === 'RECEITA' ? 'Receita' : 'Despesa'}
          </button>
        ))}
      </div>

      {/* Modo */}
      <div className="flex gap-1.5">
        {[['text','Texto', <MessageSquare key="t" className="w-3 h-3" />], ['image','Foto', <Upload key="i" className="w-3 h-3" />]].map(([m, l, ic]) => (
          <button key={m as string} onClick={() => setMode(m as 'text' | 'image')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${mode === m ? 'bg-primary-600 text-white border-primary-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'}`}>
            {ic}{l as string}
          </button>
        ))}
      </div>

      {mode === 'text' && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Cole o comprovante pessoal... ex: 'Restaurante R$ 85 cartão de crédito'" className="input-field text-sm resize-none w-full" />
      )}
      {mode === 'image' && (
        <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:border-primary-400">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return
            const reader = new FileReader()
            reader.onload = (ev) => setImg((ev.target?.result as string).split(',')[1])
            reader.readAsDataURL(f)
          }} />
          {img ? <p className="text-green-600 font-bold text-sm">✅ Imagem carregada</p> : <p className="text-zinc-400 text-sm">📷 Selecione a foto do comprovante</p>}
        </div>
      )}

      {err && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{err}</p>}

      {!draft ? (
        <button onClick={process} disabled={proc} className="w-full btn-primary text-sm py-2.5 flex items-center justify-center gap-2">
          {proc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          ALFREDO processar
        </button>
      ) : (
        <div className="rounded-xl border-2 border-primary-200 bg-primary-50/40 dark:bg-primary-950/10 p-3 space-y-2">
          <p className="text-xs font-bold text-zinc-500">ALFREDO identificou:</p>
          <div className="flex gap-3 text-sm">
            <span className="font-black text-lg">{BRL(draft.amount ?? 0)}</span>
            <span className="px-2 py-0.5 rounded-lg bg-zinc-100 text-zinc-600 text-xs font-bold self-center">{CAT_LABEL[draft.category] ?? draft.category}</span>
          </div>
          {draft.description && <p className="text-xs text-zinc-500">{draft.description}</p>}
          <div className="flex gap-2">
            <button onClick={confirm} disabled={proc} className="flex-1 btn-primary text-sm py-2 flex items-center justify-center gap-1.5">
              {proc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Confirmar
            </button>
            <button onClick={() => setDraft(null)} className="btn-secondary text-sm py-2"><RotateCcw className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab de Patrimônio
// ─────────────────────────────────────────────────────────────────────────────

function PatrimonioTab({ assets, onRefresh }: { assets: Asset[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState({ type: 'IMOVEL', name: '', currentValue: '', currency: 'BRL', acquiredValue: '', notes: '' })
  const [saving,   setSaving]   = useState(false)
  const [editing,  setEditing]  = useState<string | null>(null)
  const [editVal,  setEditVal]  = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    await fetch('/api/socio/assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, currentValue: parseFloat(form.currentValue), acquiredValue: form.acquiredValue ? parseFloat(form.acquiredValue) : undefined }) })
    setSaving(false); setShowForm(false); setForm({ type: 'IMOVEL', name: '', currentValue: '', currency: 'BRL', acquiredValue: '', notes: '' }); onRefresh()
  }

  const updateValue = async (id: string) => {
    await fetch(`/api/socio/assets?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentValue: parseFloat(editVal) }) })
    setEditing(null); onRefresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Remover este ativo?')) return
    await fetch(`/api/socio/assets?id=${id}`, { method: 'DELETE' }); onRefresh()
  }

  const total = assets.reduce((s, a) => s + Number(a.currentValue), 0)

  const byType: Record<string, { count: number; total: number }> = {}
  for (const a of assets) {
    byType[a.type] = byType[a.type] ?? { count: 0, total: 0 }
    byType[a.type].count++; byType[a.type].total += Number(a.currentValue)
  }

  return (
    <div className="space-y-4">
      {/* Resumo por tipo */}
      {Object.keys(byType).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(byType).sort((a, b) => b[1].total - a[1].total).map(([type, info]) => (
            <div key={type} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-3 text-center">
              <div className="flex justify-center text-primary-500 mb-1">{ASSET_ICON[type]}</div>
              <p className="font-black text-sm">{BRL(info.total)}</p>
              <p className="text-[10px] text-zinc-400">{ASSET_LABEL[type]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Lista de ativos */}
      <div className="space-y-1.5">
        {assets.map((a) => {
          const gain = a.acquiredValue != null ? Number(a.currentValue) - Number(a.acquiredValue) : null
          return (
            <div key={a.id} className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card px-4 py-3 flex items-center gap-3">
              <span className="text-primary-500 shrink-0">{ASSET_ICON[a.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{a.name}</p>
                <p className="text-xs text-zinc-400">{ASSET_LABEL[a.type]} {gain != null && <span className={gain >= 0 ? 'text-green-600' : 'text-red-600'}>· {gain >= 0 ? '+' : ''}{BRL(gain)} ganho</span>}</p>
              </div>
              {editing === a.id ? (
                <div className="flex gap-1.5 items-center">
                  <input type="number" value={editVal} onChange={(e) => setEditVal(e.target.value)} className="input-field text-sm py-1 w-32" />
                  <button onClick={() => updateValue(a.id)} className="btn-primary text-xs px-2 py-1">OK</button>
                  <button onClick={() => setEditing(null)} className="btn-secondary text-xs px-2 py-1">X</button>
                </div>
              ) : (
                <div className="text-right flex items-center gap-2">
                  <div>
                    <p className="font-black">{BRL(Number(a.currentValue))}</p>
                    <p className="text-[10px] text-zinc-400">{a.currency}</p>
                  </div>
                  <button onClick={() => { setEditing(a.id); setEditVal(String(a.currentValue)) }} className="p-1.5 rounded-lg hover:bg-zinc-50 text-zinc-400"><Edit3 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => remove(a.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Formulário */}
      {showForm ? (
        <form onSubmit={save} className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/10 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold mb-1 block">Tipo de Ativo</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field text-sm">
                {Object.entries(ASSET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">Nome</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Apartamento Moema" className="input-field text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">Valor Atual (R$)</label>
              <input required type="number" step="0.01" value={form.currentValue} onChange={(e) => setForm((f) => ({ ...f, currentValue: e.target.value }))} className="input-field text-sm" />
            </div>
            <div>
              <label className="text-xs font-bold mb-1 block">Valor Pago (R$) <span className="font-normal text-zinc-400">opcional</span></label>
              <input type="number" step="0.01" value={form.acquiredValue} onChange={(e) => setForm((f) => ({ ...f, acquiredValue: e.target.value }))} className="input-field text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary text-sm px-4 flex items-center gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Adicionar
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancelar</button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)} className="w-full border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl py-3 text-sm text-zinc-400 hover:border-primary-300 hover:text-primary-600 flex items-center justify-center gap-2">
          <Plus className="w-4 h-4" />Adicionar Ativo ao Patrimônio
        </button>
      )}

      {assets.length > 0 && (
        <div className="text-right text-xs text-zinc-400">
          Total: <strong className="text-zinc-700 dark:text-zinc-200">{BRL(total)}</strong>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────────────────────────────────

type SocioTab = 'overview' | 'lancamentos' | 'patrimonio' | 'transferencias' | 'fast-entry' | 'caixa-forte' | 'projecao' | 'auditor'

export function SocioDashboard({ userName }: { userName: string }) {
  const [tab,      setTab]      = useState<SocioTab>('overview')
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [summary,  setSummary]  = useState<Summary | null>(null)
  const [runway,   setRunway]   = useState<Runway | null>(null)
  const [entries,  setEntries]  = useState<Entry[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showXfer, setShowXfer] = useState(false)
  const [xferForm, setXferForm] = useState({ type: 'PRO_LABORE', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  const [xferSaving, setXferSaving] = useState(false)
  const [goalForm, setGoalForm] = useState(false)
  const [goalVal,  setGoalVal]  = useState('')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    const [p, r, e, t] = await Promise.all([
      fetch('/api/socio/profile').then((r) => r.json()),
      fetch('/api/socio/runway').then((r) => r.json()),
      fetch('/api/socio/entries').then((r) => r.json()),
      fetch('/api/socio/transfer').then((r) => r.json()),
    ])
    setProfile(p.profile); setSummary(p.summary); setRunway(r)
    setEntries(e.entries ?? []); setTransfers(Array.isArray(t) ? t : [])
    setLoading(false)
  }, [])

  useEffect(() => { loadProfile() }, [loadProfile])

  const saveTransfer = async (e: React.FormEvent) => {
    e.preventDefault(); setXferSaving(true)
    await fetch('/api/socio/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...xferForm, amount: parseFloat(xferForm.amount) }) })
    setXferSaving(false); setShowXfer(false); loadProfile()
  }

  const saveGoal = async () => {
    if (!goalVal) return
    await fetch('/api/socio/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetWealth: parseFloat(goalVal) }) })
    setGoalForm(false); loadProfile()
  }

  const TABS: { id: SocioTab; label: string }[] = [
    { id: 'overview',       label: '🏛 Visão Geral'     },
    { id: 'caixa-forte',    label: '🔐 Caixa Forte'     },
    { id: 'projecao',       label: '🚀 Rota ao Bilhão'  },
    { id: 'auditor',        label: '🔍 Auditor IA'       },
    { id: 'lancamentos',    label: '📋 Lançamentos'     },
    { id: 'patrimonio',     label: '🏆 Patrimônio'      },
    { id: 'transferencias', label: '💸 Transferências'  },
    { id: 'fast-entry',     label: '⚡ Fast-Entry'      },
  ]

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>

  return (
    <div className="space-y-6">
      {/* Header privado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-black text-xl">Wealth Dashboard — {userName}</h1>
            <p className="text-xs text-zinc-400">Área privada de finanças pessoais · Véu corporativo ativo</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold">
          <Shield className="w-3.5 h-3.5" />Acesso exclusivo do sócio
        </div>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-700">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-amber-500 text-amber-600' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && summary && runway && (
        <div className="space-y-5">
          {/* KPIs principais */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Patrimônio Total',   val: BRL(summary.totalPatrimonio),   color: 'text-amber-600',  sub: 'consolidado'     },
              { label: 'Receita (30 dias)',   val: BRL(summary.monthlyIncome),     color: 'text-green-600',  sub: 'pró-lab + dist.' },
              { label: 'Despesa (30 dias)',   val: BRL(summary.monthlyExpense),    color: 'text-red-500',    sub: 'gastos pessoais' },
              { label: 'Saldo Líquido',       val: BRL(summary.monthlyBalance),    color: summary.monthlyBalance >= 0 ? 'text-green-600' : 'text-red-600', sub: 'últimos 30 dias' },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4 text-center">
                <p className={`text-2xl font-black ${k.color}`}>{k.val}</p>
                <p className="text-xs font-bold text-zinc-500 mt-0.5">{k.label}</p>
                <p className="text-[10px] text-zinc-400">{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Runway + ALFREDO IA */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 text-center space-y-3">
              <p className="text-xs font-bold text-zinc-500 uppercase">Independência Financeira</p>
              <IndependenceGauge score={runway.independenceScore} years={runway.runwayYears} />
              <p className="text-xs text-zinc-400">Gasto médio: <strong>{BRL(runway.avgMonthlyExpense)}/mês</strong></p>
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-1.5"><Target className="w-3.5 h-3.5" />Meta Patrimonial</p>
                <button onClick={() => setGoalForm((v) => !v)} className="text-[10px] text-amber-600 font-bold hover:underline">Editar</button>
              </div>
              {goalForm ? (
                <div className="flex gap-2">
                  <input type="number" value={goalVal} onChange={(e) => setGoalVal(e.target.value)} placeholder="Ex: 10000000" className="input-field text-sm flex-1" />
                  <button onClick={saveGoal} className="btn-primary text-sm px-3">OK</button>
                </div>
              ) : (
                <TargetBar current={summary.totalPatrimonio} target={summary.targetWealth} progress={summary.targetProgress} />
              )}
              {!summary.targetWealth && !goalForm && (
                <p className="text-xs text-zinc-400 text-center">Defina sua meta de patrimônio →</p>
              )}
            </div>
          </div>

          {/* ALFREDO IA sugestão de retirada */}
          {runway.aiSuggestion && (
            <div className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-primary-100/30 dark:from-primary-950/20 dark:to-primary-950/10 p-4 flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-bold text-sm flex items-center gap-2">ALFREDO IA — Sugestão do mês
                  <span className="text-xs font-normal text-zinc-500">Lucro empresa: {BRL(runway.companyProfit)}</span>
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1">{runway.aiSuggestion}</p>
                {runway.suggestedWithdrawal > 0 && (
                  <button onClick={() => { setXferForm((f) => ({ ...f, type: 'DISTRIBUICAO_LUCRO', amount: String(Math.round(runway.suggestedWithdrawal)) })); setShowXfer(true); setTab('transferencias') }}
                    className="mt-2 text-xs font-bold text-primary-600 hover:underline flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />Criar transferência de {BRL(runway.suggestedWithdrawal)} →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Sparkline */}
          {runway.monthlyHistory.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
              <p className="text-xs font-bold text-zinc-500 uppercase mb-3">Histórico 6 meses</p>
              <Sparkline data={runway.monthlyHistory} />
            </div>
          )}
        </div>
      )}

      {/* ── CAIXA FORTE ──────────────────────────────────────────────────── */}
      {tab === 'caixa-forte' && (
        <CaixaForteWidget onRequestTransfer={(amount) => {
          setXferForm((f) => ({ ...f, type: 'DISTRIBUICAO_LUCRO', amount: String(amount) }))
          setShowXfer(true)
          setTab('transferencias')
        }} />
      )}

      {/* ── PROJEÇÃO BILHÃO ───────────────────────────────────────────────── */}
      {tab === 'projecao' && <ProjecaoBilhaoWidget />}

      {/* ── AUDITOR DE CUSTOS ─────────────────────────────────────────────── */}
      {tab === 'auditor' && <CostAuditorWidget />}

      {/* ── LANÇAMENTOS ──────────────────────────────────────────────────── */}
      {tab === 'lancamentos' && (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <Clock className="w-10 h-10 mx-auto mb-2" />
              <p>Nenhum lançamento pessoal ainda.</p>
              <p className="text-sm mt-1">Use o <button onClick={() => setTab('fast-entry')} className="text-primary-600 font-bold hover:underline">Fast-Entry</button> para lançar via IA.</p>
            </div>
          ) : entries.map((e) => (
            <div key={e.id} className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card px-4 py-3 flex items-center gap-3">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${e.type === 'RECEITA' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                {e.type === 'RECEITA' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{CAT_LABEL[e.category] ?? e.category}</p>
                <p className="text-xs text-zinc-400 truncate">{e.description ?? '—'} · {new Date(e.date).toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="text-right">
                <p className={`font-black ${e.type === 'RECEITA' ? 'text-green-600' : 'text-red-500'}`}>{BRL(Number(e.amount))}</p>
                {e.aiExtracted && <p className="text-[9px] text-primary-400">⚡ IA</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PATRIMÔNIO ───────────────────────────────────────────────────── */}
      {tab === 'patrimonio' && profile && (
        <PatrimonioTab assets={profile.assets} onRefresh={loadProfile} />
      )}

      {/* ── TRANSFERÊNCIAS ───────────────────────────────────────────────── */}
      {tab === 'transferencias' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowXfer((v) => !v)} className="btn-primary text-sm flex items-center gap-1.5">
              <Plus className="w-4 h-4" />Nova Transferência da Empresa
            </button>
          </div>

          {showXfer && (
            <form onSubmit={saveTransfer} className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3">
              <p className="font-bold text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-amber-500" />Transferência: Ads Ativos → Sócio</p>
              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold mb-1 block">Tipo</label>
                  <select value={xferForm.type} onChange={(e) => setXferForm((f) => ({ ...f, type: e.target.value }))} className="input-field text-sm">
                    <option value="PRO_LABORE">Pró-labore</option>
                    <option value="DISTRIBUICAO_LUCRO">Distribuição de Lucros</option>
                    <option value="ADIANTAMENTO">Adiantamento</option>
                    <option value="REEMBOLSO">Reembolso</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block">Valor (R$)</label>
                  <input required type="number" step="0.01" value={xferForm.amount} onChange={(e) => setXferForm((f) => ({ ...f, amount: e.target.value }))} className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block">Data</label>
                  <input required type="date" value={xferForm.date} onChange={(e) => setXferForm((f) => ({ ...f, date: e.target.value }))} className="input-field text-sm" />
                </div>
              </div>
              <textarea value={xferForm.notes} onChange={(e) => setXferForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Observações..." rows={2} className="input-field text-sm resize-none w-full" />
              <p className="text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-2">⚠️ Esta ação lançará automaticamente <strong>DESPESA no DRE da empresa</strong> e <strong>RECEITA no seu painel pessoal</strong>.</p>
              <div className="flex gap-2">
                <button type="submit" disabled={xferSaving} className="btn-primary text-sm flex items-center gap-1.5">
                  {xferSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}Confirmar Transferência
                </button>
                <button type="button" onClick={() => setShowXfer(false)} className="btn-secondary text-sm">Cancelar</button>
              </div>
            </form>
          )}

          {transfers.length === 0 ? (
            <div className="text-center py-10 text-zinc-400"><p>Nenhuma transferência registrada.</p></div>
          ) : transfers.map((t) => (
            <div key={t.id} className="rounded-xl border border-zinc-100 dark:border-zinc-700 bg-white dark:bg-ads-dark-card px-4 py-3 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-sm">{t.type === 'PRO_LABORE' ? 'Pró-labore' : t.type === 'DISTRIBUICAO_LUCRO' ? 'Distribuição de Lucros' : t.type === 'ADIANTAMENTO' ? 'Adiantamento' : 'Reembolso'}</p>
                <p className="text-xs text-zinc-400">{new Date(t.date).toLocaleDateString('pt-BR')}{t.notes ? ` · ${t.notes}` : ''}</p>
              </div>
              <p className="font-black text-green-600 text-lg">{BRL(Number(t.amount))}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── FAST-ENTRY ───────────────────────────────────────────────────── */}
      {tab === 'fast-entry' && (
        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-3">
            <div>
              <h3 className="font-black flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />Fast-Entry Pessoal</h3>
              <p className="text-xs text-zinc-400 mt-0.5">ALFREDO IA classifica nas categorias pessoais (Lazer, Moradia, Saúde…)</p>
            </div>
            <PersonalFastEntry onSaved={loadProfile} />
          </div>
        </div>
      )}
    </div>
  )
}
