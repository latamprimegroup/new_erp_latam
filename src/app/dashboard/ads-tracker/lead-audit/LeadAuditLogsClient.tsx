'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Download,
  Monitor,
  Network,
  RefreshCw,
  Smartphone,
  Tablet,
  X,
} from 'lucide-react'

type LogRow = {
  id: string
  ip: string
  country: string | null
  region: string | null
  countryFlag: string
  userAgent: string | null
  referer: string | null
  gclidPresent: boolean
  gclid: string | null
  utmCampaign: string | null
  utmContent: string | null
  verdict: string
  reason: string | null
  asn: string | null
  ispName: string | null
  contextKey: string | null
  shieldProfile: string | null
  deviceCategory: string | null
  browserFamily: string | null
  sessionDurationMs: number | null
  uniId: string | null
  createdAt: string
  fraudSuspect: boolean
  automationHint: string | null
  auditStyleAlert: string | null
}

type UniOpt = { id: string; gmailMasked: string; cnpjMasked: string; status: string }

function deviceIcon(category: string | null) {
  const c = (category || '').toLowerCase()
  if (c === 'mobile') return <Smartphone className="w-4 h-4 text-zinc-400" aria-hidden />
  if (c === 'tablet') return <Tablet className="w-4 h-4 text-zinc-400" aria-hidden />
  return <Monitor className="w-4 h-4 text-zinc-400" aria-hidden />
}

function shieldRouteLabel(log: LogRow): { text: string; className: string } {
  if (log.verdict === 'BLOCKED') return { text: 'Retido', className: 'text-amber-400' }
  const p = log.shieldProfile?.toUpperCase()
  if (p === 'MONEY') return { text: 'Money', className: 'text-emerald-400' }
  if (p === 'SAFE') return { text: 'Safe', className: 'text-sky-400' }
  if (log.verdict === 'ALLOWED') return { text: 'Permitido', className: 'text-zinc-400' }
  return { text: log.verdict, className: 'text-zinc-500' }
}

function ipv4ToSlash24(ip: string): string | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const ok = parts.every((p) => {
    const n = Number(p)
    return Number.isInteger(n) && n >= 0 && n <= 255
  })
  if (!ok) return null
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
}

function formatSessionMs(ms: number | null): string {
  if (ms == null || ms < 0) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function LeadAuditLogsClient({ canBan }: { canBan: boolean }) {
  const [hours, setHours] = useState(72)
  const [gclidOnly, setGclidOnly] = useState(false)
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [uniId, setUniId] = useState('')
  const [automationExport, setAutomationExport] = useState(false)
  const [logs, setLogs] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [disclaimer, setDisclaimer] = useState('')
  const [fraudWindowHours, setFraudWindowHours] = useState(6)
  const [unis, setUnis] = useState<UniOpt[]>([])
  const [drawerId, setDrawerId] = useState<string | null>(null)
  const [drawerLog, setDrawerLog] = useState<LogRow | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)

  const take = 50

  const querySuffix = useMemo(() => {
    const p = new URLSearchParams()
    p.set('hours', String(hours))
    p.set('take', String(take))
    if (gclidOnly) p.set('gclid', '1')
    if (blockedOnly) p.set('blocked', '1')
    if (uniId.trim()) p.set('uniId', uniId.trim())
    return p.toString()
  }, [hours, take, gclidOnly, blockedOnly, uniId])

  const load = useCallback(
    async (nextSkip: number, append: boolean) => {
      setErr(null)
      const p = new URLSearchParams(querySuffix)
      p.set('skip', String(nextSkip))
      setLoading(true)
      try {
        const r = await fetch(`/api/admin/traffic-shield/logs?${p.toString()}`)
        if (!r.ok) throw new Error('logs')
        const j = (await r.json()) as {
          logs: LogRow[]
          total: number
          fraudWindowHours?: number
          disclaimer?: string
        }
        setTotal(j.total ?? 0)
        setFraudWindowHours(j.fraudWindowHours ?? 6)
        if (j.disclaimer) setDisclaimer(j.disclaimer)
        setLogs((prev) => (append ? [...prev, ...(j.logs || [])] : j.logs || []))
      } catch {
        setErr('Não foi possível carregar os logs.')
      } finally {
        setLoading(false)
      }
    },
    [querySuffix]
  )

  useEffect(() => {
    void load(0, false)
  }, [load])

  useEffect(() => {
    fetch('/api/admin/ads-tracker/uni-options')
      .then((r) => (r.ok ? r.json() : { unis: [] }))
      .then((j: { unis?: UniOpt[] }) => setUnis(j.unis || []))
      .catch(() => setUnis([]))
  }, [])

  useEffect(() => {
    if (!drawerId) {
      setDrawerLog(null)
      return
    }
    setDrawerLoading(true)
    fetch(`/api/admin/traffic-shield/logs/${drawerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { log?: LogRow } | null) => {
        setDrawerLog(j?.log ?? null)
      })
      .catch(() => setDrawerLog(null))
      .finally(() => setDrawerLoading(false))
  }, [drawerId])

  async function banIp(ip: string, note: string) {
    if (!canBan) return
    if (!confirm(`Bloquear ${ip} e enviar lista ao edge?`)) return
    const r = await fetch('/api/admin/traffic-shield/ip-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, note, push: true }),
    })
    if (!r.ok) setErr('Banimento falhou.')
    else void load(0, false)
  }

  function exportIps() {
    const p = new URLSearchParams(querySuffix)
    if (automationExport) p.set('automation', '1')
    const url = `/api/admin/traffic-shield/logs/export?${p.toString()}`
    void fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('export')
        return r.blob()
      })
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'traffic-shield-ip-list.txt'
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch(() => setErr('Exportação falhou.'))
  }

  const hasMore = logs.length < total

  return (
    <div className="space-y-6">
      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      {disclaimer && (
        <p className="text-[11px] text-zinc-500 leading-relaxed border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
          {disclaimer}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-zinc-400 space-y-1">
          Janela (horas)
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
            className="block rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white"
          >
            {[24, 48, 72, 168].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-950/50">
          <input type="checkbox" checked={gclidOnly} onChange={(e) => setGclidOnly(e.target.checked)} />
          Só com GCLID
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-950/50">
          <input type="checkbox" checked={blockedOnly} onChange={(e) => setBlockedOnly(e.target.checked)} />
          Só bloqueados
        </label>

        <label className="text-xs text-zinc-400 space-y-1 min-w-[200px]">
          UNI (conta + cofre)
          <select
            value={uniId}
            onChange={(e) => setUniId(e.target.value)}
            className="block w-full rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm text-white"
          >
            <option value="">Todas</option>
            {unis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.gmailMasked} · {u.cnpjMasked} ({u.status})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void load(0, false)}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>

        <div className="flex flex-col gap-1 border border-zinc-800 rounded-lg px-3 py-2 bg-zinc-950/50">
          <span className="text-[10px] uppercase text-zinc-500">Exportar IPs</span>
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={automationExport}
              onChange={(e) => setAutomationExport(e.target.checked)}
            />
            Só com assinatura de automatismo (UA)
          </label>
          <button
            type="button"
            onClick={() => exportIps()}
            className="inline-flex items-center gap-2 text-sm text-sky-300 hover:underline"
          >
            <Download className="w-4 h-4" />
            Descarregar .txt (1 IP por linha)
          </button>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600">
        IPs com ≥2 <code className="text-zinc-500">context_key</code> distintos nos últimos {fraudWindowHours}h aparecem com realce
        (possível fraude de clique ou varredura). Envie GCLID/UTMs/UNI no POST de ingestão do edge.
      </p>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-200">Auditoria granular</h3>
          <span className="text-[10px] text-zinc-500">
            {logs.length} de {total} nesta vista
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1400px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Data/Hora</th>
                <th className="text-left p-2">IP</th>
                <th className="text-left p-2">Loc.</th>
                <th className="text-left p-2">Disp.</th>
                <th className="text-left p-2">Browser</th>
                <th className="text-left p-2">Referer</th>
                <th className="text-left p-2">Shield</th>
                <th className="text-left p-2">GCLID</th>
                <th className="text-left p-2">UTM camp.</th>
                <th className="text-left p-2">UTM content</th>
                <th className="text-right p-2">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {logs.length === 0 && !loading ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-zinc-500">
                    Sem eventos nesta combinação de filtros.
                  </td>
                </tr>
              ) : (
                logs.map((r) => {
                  const shield = shieldRouteLabel(r)
                  const rowTone = r.fraudSuspect ? 'bg-red-950/25 ring-1 ring-red-900/40' : ''
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-zinc-900/40 cursor-pointer ${rowTone}`}
                      onClick={() => setDrawerId(r.id)}
                    >
                      <td className="p-2 text-zinc-500 whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="p-2 font-mono text-zinc-200 whitespace-nowrap">
                        {r.ip}
                        {r.fraudSuspect && (
                          <span className="ml-1 text-[10px] text-red-400 font-sans">multi-contexto</span>
                        )}
                      </td>
                      <td className="p-2 text-zinc-300 max-w-[140px] truncate" title={[r.country, r.region].filter(Boolean).join(' / ')}>
                        <span className="mr-1" title={r.country || ''}>
                          {r.countryFlag}
                        </span>
                        {[r.region, r.country].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="p-2">{deviceIcon(r.deviceCategory)}</td>
                      <td className="p-2 text-zinc-400 max-w-[100px] truncate" title={r.browserFamily || ''}>
                        {r.browserFamily || '—'}
                      </td>
                      <td className="p-2 text-zinc-500 max-w-[160px] truncate" title={r.referer || ''}>
                        {r.referer || '—'}
                      </td>
                      <td className="p-2">
                        <span className={shield.className}>{shield.text}</span>
                        {r.auditStyleAlert && (
                          <div className="text-[10px] text-amber-400/90 mt-0.5 max-w-[180px]">{r.auditStyleAlert}</div>
                        )}
                      </td>
                      <td className="p-2 font-mono text-[10px] max-w-[120px] truncate" title={r.gclid || ''}>
                        {r.gclid ? r.gclid.slice(0, 24) + (r.gclid.length > 24 ? '…' : '') : r.gclidPresent ? 'presente' : '—'}
                      </td>
                      <td className="p-2 text-zinc-500 max-w-[100px] truncate" title={r.utmCampaign || ''}>
                        {r.utmCampaign || '—'}
                      </td>
                      <td className="p-2 text-zinc-500 max-w-[100px] truncate" title={r.utmContent || ''}>
                        {r.utmContent || '—'}
                      </td>
                      <td className="p-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {canBan ? (
                          <span className="inline-flex flex-col gap-1 items-end">
                            <button
                              type="button"
                              onClick={() => void banIp(r.ip, 'Ban IP (Módulo 09)')}
                              className="text-rose-400 hover:underline"
                            >
                              Banir IP
                            </button>
                            {ipv4ToSlash24(r.ip) && (
                              <button
                                type="button"
                                onClick={() => {
                                  const cidr = ipv4ToSlash24(r.ip)
                                  if (cidr) void banIp(cidr, 'Ban /24 (Módulo 09)')
                                }}
                                className="text-rose-300/80 hover:underline text-[10px]"
                              >
                                Banir /24
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="p-3 border-t border-zinc-800 text-center">
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(logs.length, true)}
              className="text-sm text-sky-400 hover:underline disabled:opacity-40"
            >
              Carregar mais
            </button>
          </div>
        )}
      </div>

      {drawerId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="presentation" onClick={() => setDrawerId(null)}>
          <aside
            className="w-full max-w-lg h-full bg-zinc-950 border-l border-zinc-800 shadow-xl overflow-y-auto p-5 space-y-4"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-100">Inspeção de clique</h3>
              <button
                type="button"
                onClick={() => setDrawerId(null)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {drawerLoading && <p className="text-sm text-zinc-500">A carregar…</p>}
            {!drawerLoading && drawerLog && (
              <>
                <dl className="space-y-3 text-xs">
                  <div>
                    <dt className="text-zinc-500">Data/Hora</dt>
                    <dd className="font-mono text-zinc-200">{new Date(drawerLog.createdAt).toLocaleString('pt-BR')}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">IP</dt>
                    <dd className="font-mono text-zinc-200">{drawerLog.ip}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">ASN / ISP</dt>
                    <dd className="text-zinc-300 flex items-start gap-2">
                      <Network className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" />
                      <span>
                        {drawerLog.asn ? <>ASN {drawerLog.asn}</> : '—'}
                        {drawerLog.ispName && (
                          <>
                            <br />
                            {drawerLog.ispName}
                          </>
                        )}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Tempo de sessão (relatório)</dt>
                    <dd className="text-zinc-200">{formatSessionMs(drawerLog.sessionDurationMs)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">User-Agent (bruto)</dt>
                    <dd className="mt-1 p-2 rounded-lg bg-black/40 border border-zinc-800 font-mono text-[10px] text-zinc-300 break-all whitespace-pre-wrap">
                      {drawerLog.userAgent || '—'}
                    </dd>
                  </div>
                  {drawerLog.automationHint && (
                    <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-2">
                      <p className="text-[10px] uppercase text-amber-500 mb-1">Assinatura UA</p>
                      <p className="text-amber-100/90">{drawerLog.automationHint}</p>
                    </div>
                  )}
                  {drawerLog.auditStyleAlert && (
                    <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-2">
                      <p className="text-[10px] uppercase text-red-400 mb-1">Alerta</p>
                      <p className="text-red-100/90">{drawerLog.auditStyleAlert}</p>
                    </div>
                  )}
                  <div>
                    <dt className="text-zinc-500">Context key / UNI</dt>
                    <dd className="text-zinc-300 break-all">
                      {drawerLog.contextKey || '—'}
                      {drawerLog.uniId && (
                        <>
                          <br />
                          <span className="text-zinc-500">uni_id:</span> {drawerLog.uniId}
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">GCLID completo</dt>
                    <dd className="font-mono text-[10px] break-all text-zinc-300">{drawerLog.gclid || '—'}</dd>
                  </div>
                </dl>
                {canBan && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => void banIp(drawerLog.ip, 'Ban IP (drawer M09)')}
                      className="rounded-lg bg-rose-950 border border-rose-800 px-3 py-2 text-xs text-rose-100"
                    >
                      Banir IP
                    </button>
                    {ipv4ToSlash24(drawerLog.ip) && (
                      <button
                        type="button"
                        onClick={() => {
                          const c = ipv4ToSlash24(drawerLog.ip)
                          if (c) void banIp(c, 'Ban /24 (drawer M09)')
                        }}
                        className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
                      >
                        Banir range /24
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
