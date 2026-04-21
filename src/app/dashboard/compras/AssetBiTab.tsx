'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Star, AlertTriangle, Loader2, RefreshCw, Copy, CheckCheck } from 'lucide-react'

type Volume = { count: number; revenue: number; cost: number; grossMargin: number; marginPct: number }
type VendorRow = { id: string; name: string; category: string; rating: number; count: number; revenue: number; margin: number; marginPct: number; failRate: number; healthScore: number; dead: number; total: number }
type Seller = { user: { id: string; name: string | null; email: string }; count: number; totalRevenue: number; totalMargin: number }
type BIData = {
  volume: { today: Volume; week: Volume; month: Volume; allTime: Volume }
  vendorRanking: VendorRow[]
  pipeline: Record<string, number>
  topSellers: Seller[]
}

const brl  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct  = (v: number) => `${Math.round(v * 10) / 10}%`
const SCORE_COLOR = (s: number) => s >= 30 ? 'text-green-600' : s >= 10 ? 'text-amber-600' : 'text-red-600'
const SCORE_BG    = (s: number) => s >= 30 ? 'bg-green-100 dark:bg-green-950/20' : s >= 10 ? 'bg-amber-100 dark:bg-amber-950/20' : 'bg-red-100 dark:bg-red-950/20'

// ── Lista WhatsApp ──────────────────────────────────────────────────────────

function ListaComunidade() {
  const [loading, setLoading] = useState(false)
  const [text, setText]       = useState('')
  const [count, setCount]     = useState(0)
  const [copied, setCopied]   = useState(false)
  const [category, setCategory] = useState('')

  const generate = async () => {
    setLoading(true)
    const p = new URLSearchParams({ format: 'text' })
    if (category) p.set('category', category)
    const r = await fetch(`/api/compras/ativos/lista-comunidade?${p}`)
    if (r.ok) {
      setText(await r.text())
      setCount(parseInt(r.headers.get('X-Asset-Count') ?? '0', 10))
    }
    setLoading(false)
  }

  const copyAll = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true); setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold">Lista para Comunidades (sem preço)</h3>
        <div className="flex gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-field py-1.5 text-sm">
            <option value="">Todas as categorias</option>
            {['CONTAS','PERFIS','BM','PROXIES','SOFTWARE','INFRA','HARDWARE','OUTROS'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={generate} disabled={loading} className="btn-primary flex items-center gap-1.5 text-sm">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '⚡'}Gerar Lista
          </button>
        </div>
      </div>

      {text && (
        <>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{count} ativo(s) disponíveis gerados</span>
            <button onClick={copyAll} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-bold transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
              {copied ? <><CheckCheck className="w-3.5 h-3.5" />Copiado!</> : <><Copy className="w-3.5 h-3.5" />Copiar Tudo</>}
            </button>
          </div>
          <textarea readOnly value={text} className="w-full h-64 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 text-xs font-mono resize-none focus:outline-none" />
          <p className="text-[10px] text-zinc-400">✅ Nenhum preço, custo ou dado de fornecedor incluído — seguro para copiar e distribuir.</p>
        </>
      )}
    </div>
  )
}

// ── BI Principal ─────────────────────────────────────────────────────────────

export function AssetBiTab() {
  const [data, setData]   = useState<BIData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/vendas/ativos/bi')
    if (r.ok) setData(await r.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
  if (!data)   return <div className="text-center py-12 text-zinc-400">Sem dados de BI disponíveis</div>

  const periods = [
    { label: 'Hoje',  data: data.volume.today },
    { label: 'Semana', data: data.volume.week },
    { label: 'Mês',  data: data.volume.month },
    { label: 'Geral', data: data.volume.allTime },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">BI — Supply Chain</h2>
        <button onClick={load} className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:border-zinc-700 transition-colors">
          <RefreshCw className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* Volume e Margem */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Volume de Vendas & Margem Real</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {periods.map(({ label, data: d }) => (
            <div key={label} className="rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-ads-dark-card p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">{label}</p>
              <p className="text-2xl font-bold text-primary-600">{brl(d.revenue)}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-zinc-400">Custo</span><span className="text-red-500">{brl(d.cost)}</span></div>
                <div className="flex justify-between text-xs font-bold"><span>Margem Bruta</span><span className={d.grossMargin >= 0 ? 'text-green-600' : 'text-red-600'}>{brl(d.grossMargin)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-zinc-400">Margem %</span><span>{pct(d.marginPct)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-zinc-400">Vendas</span><span>{d.count}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ranking de Fornecedores */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Ranking de Fornecedores — Health Score</h3>
        <p className="text-[11px] text-zinc-400 mb-3">Health Score = Margem % - (Taxa de Falha × 2). Quanto mais alto, melhor o fornecedor.</p>
        {data.vendorRanking.length === 0
          ? <div className="text-center py-8 text-zinc-400 text-sm">Nenhum dado de fornecedor ainda</div>
          : (
            <div className="space-y-3">
              {data.vendorRanking.map((v, i) => (
                <div key={v.id} className={`rounded-xl border p-4 ${SCORE_BG(v.healthScore)} border-zinc-200 dark:border-zinc-700`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-8 h-8 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 flex items-center justify-center font-bold text-sm shrink-0">
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold">{v.name}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/60 dark:bg-black/20">{v.category}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, si) => <Star key={si} className={`w-3 h-3 ${si < Math.round(v.rating / 2) ? 'text-amber-400' : 'text-zinc-200'}`} fill={si < Math.round(v.rating / 2) ? 'currentColor' : 'none'} />)}
                        </div>
                      </div>
                      <div className="flex gap-3 mt-1 text-xs flex-wrap">
                        <span>Vendas: <strong>{v.count}</strong></span>
                        <span>Receita: <strong>{brl(v.revenue)}</strong></span>
                        <span>Margem: <strong className={v.marginPct >= 20 ? 'text-green-600' : v.marginPct >= 10 ? 'text-amber-600' : 'text-red-600'}>{pct(v.marginPct)}</strong></span>
                        {v.failRate > 0 && <span className="text-red-600">Taxa Falha: <strong>{pct(v.failRate)}</strong></span>}
                      </div>
                    </div>
                    <div className={`text-right shrink-0 ${SCORE_COLOR(v.healthScore)}`}>
                      <p className="text-2xl font-bold">{v.healthScore}</p>
                      <p className="text-[10px] font-semibold uppercase">Health Score</p>
                    </div>
                  </div>

                  {/* Barra de Health */}
                  <div className="mt-2 h-1.5 bg-white/50 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${v.healthScore >= 30 ? 'bg-green-500' : v.healthScore >= 10 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(100, Math.max(0, v.healthScore + 20))}%` }} />
                  </div>

                  {v.failRate > 10 && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-red-700">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Taxa de falha elevada — considere renegociar garantias ou mudar de fornecedor.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </div>

      {/* Top Vendedores */}
      {data.topSellers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Top Vendedores</h3>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                <tr className="text-left text-xs text-zinc-500 font-semibold">
                  <th className="px-4 py-3">#</th><th className="px-4 py-3">Vendedor</th>
                  <th className="px-4 py-3">Vendas</th><th className="px-4 py-3">Receita</th><th className="px-4 py-3">Margem Gerada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.topSellers.map((s, i) => (
                  <tr key={s.user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-3 font-bold text-zinc-400">#{i + 1}</td>
                    <td className="px-4 py-3"><p className="font-medium">{s.user.name ?? s.user.email}</p><p className="text-[10px] text-zinc-400">{s.user.email}</p></td>
                    <td className="px-4 py-3 font-bold">{s.count}</td>
                    <td className="px-4 py-3">{brl(s.totalRevenue)}</td>
                    <td className="px-4 py-3 font-bold text-green-600">{brl(s.totalMargin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <div>
        <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-3">Pipeline de Ordens</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(data.pipeline).map(([status, count]) => (
            count > 0 && (
              <div key={status} className="rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-center min-w-[80px]">
                <p className="text-lg font-bold">{count}</p>
                <p className="text-[10px] text-zinc-500 leading-tight">{status.replace(/_/g,' ')}</p>
              </div>
            )
          ))}
        </div>
      </div>

      {/* Lista para comunidade */}
      <ListaComunidade />
    </div>
  )
}
