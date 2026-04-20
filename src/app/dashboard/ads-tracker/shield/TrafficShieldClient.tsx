'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RefreshCw, Shield, ShieldCheck, ShieldOff, Ban, Send, AlertTriangle } from 'lucide-react'

type Overview = {
  kpis24h: {
    totalAccesses: number
    filteredAccesses: number
    cleanAccesses: number
    filterEfficiencyPct: number
  }
  chart24h: { hour: string; permitidos: number; retidos: number }[]
  suspiciousIps: { ip: string; distinctContexts: number; note: string }[]
  disclaimer: string
}

type LogRow = {
  id: string
  ip: string
  country: string | null
  region: string | null
  userAgent: string | null
  referer: string | null
  gclidPresent: boolean
  verdict: string
  reason: string | null
  asn: string | null
  contextKey: string | null
  createdAt: string
}

type Settings = {
  blockDatacenterAsns: boolean
  requireClickIdParam: boolean
  pushEnvironmentHints: boolean
  enableSpyToolBlocking: boolean
  edgeWebhookUrl: string | null
  lastPushAt: string | null
  lastPushOk: boolean
  lastPushError: string | null
}

type SpyBlockRow = {
  id: string
  kind: 'IP_CIDR' | 'USER_AGENT_SUBSTRING'
  pattern: string
  note: string | null
  active: boolean
  createdAt: string
}

export function TrafficShieldClient() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [spyBlocks, setSpyBlocks] = useState<SpyBlockRow[]>([])
  const [spyKind, setSpyKind] = useState<'IP_CIDR' | 'USER_AGENT_SUBSTRING'>('USER_AGENT_SUBSTRING')
  const [spyPattern, setSpyPattern] = useState('')
  const [spyNote, setSpyNote] = useState('')
  const [spySaving, setSpySaving] = useState(false)

  const load = useCallback(() => {
    setErr(null)
    Promise.all([
      fetch('/api/admin/traffic-shield/overview').then((r) => {
        if (!r.ok) throw new Error('overview')
        return r.json() as Promise<Overview>
      }),
      fetch('/api/admin/traffic-shield/logs?take=50').then((r) => {
        if (!r.ok) throw new Error('logs')
        return r.json() as Promise<{ logs: LogRow[] }>
      }),
      fetch('/api/admin/traffic-shield/settings').then((r) => {
        if (!r.ok) throw new Error('settings')
        return r.json() as Promise<{ settings: Settings }>
      }),
      fetch('/api/admin/traffic-shield/spy-blocks').then((r) => {
        if (!r.ok) throw new Error('spy-blocks')
        return r.json() as Promise<{ blocks: SpyBlockRow[] }>
      }),
    ])
      .then(([o, l, s, spy]) => {
        setOverview(o)
        setLogs(l.logs || [])
        setSettings(s.settings)
        setSpyBlocks(spy.blocks || [])
      })
      .catch(() => setErr('Falha ao carregar o escudo.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const t = setInterval(() => load(), 45_000)
    return () => clearInterval(t)
  }, [load])

  async function patchSettings(partial: Partial<Settings>) {
    setErr(null)
    const r = await fetch('/api/admin/traffic-shield/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    })
    if (!r.ok) {
      setErr('Não foi possível guardar definições.')
      return
    }
    const j = (await r.json()) as { settings: Settings }
    setSettings({
      blockDatacenterAsns: j.settings.blockDatacenterAsns,
      requireClickIdParam: j.settings.requireClickIdParam,
      pushEnvironmentHints: j.settings.pushEnvironmentHints,
      enableSpyToolBlocking: j.settings.enableSpyToolBlocking,
      edgeWebhookUrl: j.settings.edgeWebhookUrl,
      lastPushAt:
        j.settings.lastPushAt != null
          ? new Date(j.settings.lastPushAt as string | Date).toISOString()
          : null,
      lastPushOk: j.settings.lastPushOk,
      lastPushError: j.settings.lastPushError,
    })
  }

  async function pushNow() {
    setPushing(true)
    setErr(null)
    try {
      const r = await fetch('/api/admin/traffic-shield/push', { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error('push')
      if (!(j as { ok?: boolean }).ok && !(j as { skipped?: boolean }).skipped) {
        setErr((j as { error?: string }).error || 'Push falhou.')
      }
      load()
    } catch {
      setErr('Push ao edge falhou.')
    } finally {
      setPushing(false)
    }
  }

  async function banIp(ip: string) {
    if (!confirm(`Bloquear ${ip} e enviar lista ao edge?`)) return
    const r = await fetch('/api/admin/traffic-shield/ip-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, note: 'Manual (Traffic Shield UI)', push: true }),
    })
    if (!r.ok) setErr('Banimento falhou.')
    else load()
  }

  async function addSpyBlock(e: FormEvent) {
    e.preventDefault()
    setSpySaving(true)
    setErr(null)
    try {
      const r = await fetch('/api/admin/traffic-shield/spy-blocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: spyKind, pattern: spyPattern, note: spyNote || undefined, push: true }),
      })
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        setErr(j.error || 'Não foi possível criar regra anti-spy.')
        return
      }
      setSpyPattern('')
      setSpyNote('')
      load()
    } finally {
      setSpySaving(false)
    }
  }

  async function toggleSpyBlock(id: string, active: boolean) {
    setErr(null)
    const r = await fetch(`/api/admin/traffic-shield/spy-blocks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active, push: true }),
    })
    if (!r.ok) setErr('Atualização da regra falhou.')
    else load()
  }

  async function removeSpyBlock(id: string) {
    if (!confirm('Remover esta regra e enviar config ao edge?')) return
    setErr(null)
    const r = await fetch(`/api/admin/traffic-shield/spy-blocks/${id}`, { method: 'DELETE' })
    if (!r.ok) setErr('Remoção falhou.')
    else load()
  }

  return (
    <div className="space-y-8">
      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        {overview?.disclaimer}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
        <button
          type="button"
          onClick={() => void pushNow()}
          disabled={pushing}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-900/70 border border-sky-800 px-3 py-2 text-sm text-sky-100 disabled:opacity-40"
        >
          <Send className="w-4 h-4" />
          {pushing ? 'A enviar…' : 'Enviar config ao edge'}
        </button>
      </div>

      {overview && (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card
            icon={<Shield className="w-5 h-5 text-zinc-400" />}
            label="Pedidos (24h)"
            value={String(overview.kpis24h.totalAccesses)}
            sub="Volume reportado pelo edge"
          />
          <Card
            icon={<ShieldOff className="w-5 h-5 text-amber-400" />}
            label="Retidos pelo filtro"
            value={String(overview.kpis24h.filteredAccesses)}
            sub="Veredito BLOCKED"
          />
          <Card
            icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
            label="Permitidos"
            value={String(overview.kpis24h.cleanAccesses)}
            sub="Veredito ALLOWED"
          />
          <Card
            icon={<Ban className="w-5 h-5 text-rose-400" />}
            label="Eficiência do filtro"
            value={`${overview.kpis24h.filterEfficiencyPct}%`}
            sub="Retidos / total (24h)"
          />
        </div>
      )}

      {settings && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-200">Configurações globais (enviadas ao edge)</h2>
          <p className="text-[11px] text-zinc-500">
            O ERP apenas publica estas flags e listas; o servidor de borda aplica a política (WAF, rotas, respostas HTTP)
            em conformidade com a lei e com as regras das plataformas.
          </p>
          <div className="space-y-3">
            <ToggleRow
              label="Sugerir bloqueio de ASNs de datacenter"
              checked={settings.blockDatacenterAsns}
              onChange={(v) => void patchSettings({ blockDatacenterAsns: v })}
            />
            <ToggleRow
              label="Exigir parâmetro de clique (ex. gclid) — política no edge"
              checked={settings.requireClickIdParam}
              onChange={(v) => void patchSettings({ requireClickIdParam: v })}
            />
            <ToggleRow
              label="Enviar hints de ambiente (WebRTC/Canvas, etc.) ao edge"
              checked={settings.pushEnvironmentHints}
              onChange={(v) => void patchSettings({ pushEnvironmentHints: v })}
            />
            <ToggleRow
              label="Módulo 12 — Incluir anti-spy (IPs/UA de ferramentas de espionagem no payload do edge)"
              checked={settings.enableSpyToolBlocking}
              onChange={(v) => void patchSettings({ enableSpyToolBlocking: v })}
            />
          </div>
          <label className="block text-xs text-zinc-400 space-y-1">
            URL do webhook de borda (opcional; sobrescreve .env se preenchido)
            <input
              type="url"
              defaultValue={settings.edgeWebhookUrl || ''}
              onBlur={(e) => {
                const v = e.target.value.trim()
                void patchSettings({ edgeWebhookUrl: v || null })
              }}
              className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white"
              placeholder="https://…"
            />
          </label>
          <p className="text-[11px] text-zinc-500">
            Último envio:{' '}
            {settings.lastPushAt ? new Date(settings.lastPushAt).toLocaleString('pt-BR') : '—'} ·{' '}
            <span className={settings.lastPushOk ? 'text-emerald-400' : 'text-amber-400'}>
              {settings.lastPushOk ? 'OK' : 'Falha ou pendente'}
            </span>
            {settings.lastPushError && (
              <span className="block text-red-400/90 mt-1">{settings.lastPushError}</span>
            )}
          </p>
          <p className="text-[11px] text-zinc-600">
            Agendar: GET <code className="text-zinc-400">/api/cron/traffic-shield-push?secret=CRON_SECRET</code> a cada
            5 minutos.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-200">Módulo 12 — Anti-spy e scraping</h2>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          O ERP envia ao edge a lista <code className="text-zinc-400">blockedAddresses</code> (inclui IPs/CIDR de spy
          tools) e <code className="text-zinc-400">blockedUserAgentSubstrings</code> (lista predefinida + regras abaixo).
          O servidor de borda deve aplicar bloqueio ou resposta genérica, em conformidade com a lei e com as políticas
          das plataformas.
        </p>
        <form onSubmit={(e) => void addSpyBlock(e)} className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-zinc-400">
            Tipo
            <select
              value={spyKind}
              onChange={(e) => setSpyKind(e.target.value as 'IP_CIDR' | 'USER_AGENT_SUBSTRING')}
              className="block mt-1 rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-2 text-sm"
            >
              <option value="USER_AGENT_SUBSTRING">Substring no User-Agent</option>
              <option value="IP_CIDR">IPv4 / CIDR</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400 flex-1 min-w-[200px]">
            Padrão
            <input
              value={spyPattern}
              onChange={(e) => setSpyPattern(e.target.value)}
              className="block mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm font-mono"
              placeholder={spyKind === 'IP_CIDR' ? '203.0.113.0/24' : 'adspy'}
            />
          </label>
          <label className="text-xs text-zinc-400 flex-1 min-w-[160px]">
            Nota (opcional)
            <input
              value={spyNote}
              onChange={(e) => setSpyNote(e.target.value)}
              className="block mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={spySaving || !spyPattern.trim()}
            className="rounded-lg bg-rose-900/50 border border-rose-800 px-3 py-2 text-sm text-rose-100 disabled:opacity-40"
          >
            {spySaving ? 'A guardar…' : 'Adicionar'}
          </button>
        </form>
        <div className="overflow-x-auto border border-zinc-800 rounded-lg">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Padrão</th>
                <th className="text-left p-2">Nota</th>
                <th className="text-left p-2">Ativo</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {spyBlocks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-zinc-500">
                    Sem regras personalizadas — ainda há uma lista predefinida de UAs quando o toggle anti-spy está ligado.
                  </td>
                </tr>
              ) : (
                spyBlocks.map((b) => (
                  <tr key={b.id} className="hover:bg-zinc-900/40">
                    <td className="p-2 text-zinc-400">{b.kind === 'IP_CIDR' ? 'IP/CIDR' : 'UA'}</td>
                    <td className="p-2 font-mono text-zinc-200">{b.pattern}</td>
                    <td className="p-2 text-zinc-500 max-w-[180px] truncate" title={b.note || ''}>
                      {b.note || '—'}
                    </td>
                    <td className="p-2">{b.active ? <span className="text-emerald-400">Sim</span> : <span className="text-zinc-500">Não</span>}</td>
                    <td className="p-2 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => void toggleSpyBlock(b.id, !b.active)}
                        className="text-sky-400 hover:underline"
                      >
                        {b.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button type="button" onClick={() => void removeSpyBlock(b.id)} className="text-rose-400 hover:underline">
                        Remover
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {overview && overview.suspiciousIps.length > 0 && (
        <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-4">
          <h3 className="text-sm font-semibold text-amber-200 mb-2">Padrão anómalo (muitos contextos / IP)</h3>
          <ul className="text-xs text-amber-100/90 space-y-1">
            {overview.suspiciousIps.map((s) => (
              <li key={s.ip}>
                <span className="font-mono">{s.ip}</span> — {s.distinctContexts} contextos · {s.note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {overview && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4 h-[320px]">
          <h3 className="text-sm font-semibold text-zinc-200 mb-3">Últimas 24h — permitidos vs retidos</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={overview.chart24h.length > 0 ? overview.chart24h : [{ hour: '—', permitidos: 0, retidos: 0 }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="hour" tick={{ fill: '#71717a', fontSize: 10 }} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46' }} />
              <Legend />
              <Bar dataKey="permitidos" fill="#22c55e" name="Permitidos" />
              <Bar dataKey="retidos" fill="#f97316" name="Retidos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Log recente (50)</h3>
          <span className="text-[10px] text-zinc-500">Atualiza a cada 45s</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[960px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Quando</th>
                <th className="text-left p-2">IP</th>
                <th className="text-left p-2">Loc.</th>
                <th className="text-left p-2">Dispositivo (UA)</th>
                <th className="text-left p-2">Referer</th>
                <th className="text-left p-2">GCLID</th>
                <th className="text-left p-2">Veredito</th>
                <th className="text-right p-2">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-zinc-500">
                    Sem eventos. Configure o edge para POST em{' '}
                    <code className="text-zinc-400">/api/public/traffic-shield/ingest</code>.
                  </td>
                </tr>
              ) : (
                logs.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-900/40">
                    <td className="p-2 text-zinc-500 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-2 font-mono text-zinc-200">{r.ip}</td>
                    <td className="p-2 text-zinc-400 max-w-[120px] truncate" title={`${r.country || ''} ${r.region || ''}`}>
                      {[r.country, r.region].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="p-2 text-zinc-500 max-w-[200px] truncate" title={r.userAgent || ''}>
                      {r.userAgent || '—'}
                    </td>
                    <td className="p-2 text-zinc-500 max-w-[160px] truncate" title={r.referer || ''}>
                      {r.referer || '—'}
                    </td>
                    <td className="p-2">{r.gclidPresent ? <span className="text-emerald-400">Sim</span> : <span className="text-zinc-500">Não</span>}</td>
                    <td className="p-2">
                      <span
                        className={
                          r.verdict === 'BLOCKED' ? 'text-amber-400' : r.verdict === 'ALLOWED' ? 'text-emerald-400' : ''
                        }
                      >
                        {r.verdict}
                      </span>
                      {r.reason && <div className="text-[10px] text-zinc-600">{r.reason}</div>}
                    </td>
                    <td className="p-2 text-right">
                      <button
                        type="button"
                        onClick={() => void banIp(r.ip)}
                        className="text-rose-400 hover:underline"
                      >
                        Bloquear IP
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Card({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 p-4">
      <div className="flex items-center gap-2 text-zinc-400 text-[10px] font-semibold uppercase tracking-wide mb-2">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-mono text-white">{value}</p>
      <p className="text-[11px] text-zinc-500 mt-2">{sub}</p>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer rounded-lg border border-zinc-800 bg-black/20 px-3 py-2">
      <span className="text-sm text-zinc-300">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-600"
      />
    </label>
  )
}
