'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type CheckRow = {
  id: string
  domainHost: string
  status: string
  detail: string | null
  panicTriggered: boolean
  checkedAt: string
}

type WarningHost = {
  domainHost: string
  checkedAt: string
  detail: string | null
}

export function DomainReputationClient() {
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [warningHosts, setWarningHosts] = useState<WarningHost[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    fetch('/api/admin/ads-tracker/domain-reputation?take=100')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<{ checks: CheckRow[]; warningHosts: WarningHost[] }>
      })
      .then((j) => {
        setChecks(j.checks || [])
        setWarningHosts(j.warningHosts || [])
      })
      .catch(() => setErr('Não foi possível carregar o histórico.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      {err && (
        <p className="text-sm text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {err}
        </p>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
        Consulta periódica à API Google Safe Browsing (malware, phishing, software indesejado). Não equivale ao estado de
        revisão da conta Google Ads. Agendar{' '}
        <code className="text-zinc-400">GET /api/cron/tracker-domain-reputation</code> (horário no{' '}
        <code className="text-zinc-400">vercel.json</code> ou scheduler externo). Alertas Telegram: variáveis{' '}
        <code className="text-zinc-400">TRACKER_ALERT_*</code> no <code className="text-zinc-400">.env</code>.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setLoading(true)
            load()
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {warningHosts.length > 0 && (
        <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-4">
          <h2 className="text-sm font-semibold text-rose-200 mb-2">Domínios com último alerta Safe Browsing</h2>
          <ul className="text-xs text-rose-100/90 space-y-2">
            {warningHosts.map((w) => (
              <li key={w.domainHost}>
                <span className="font-mono font-semibold">{w.domainHost}</span>
                <span className="text-zinc-500 ml-2">{new Date(w.checkedAt).toLocaleString('pt-BR')}</span>
                {w.detail && <p className="text-zinc-400 mt-0.5">{w.detail}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/90 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Histórico de verificações</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
              <tr>
                <th className="text-left p-2">Quando</th>
                <th className="text-left p-2">Domínio</th>
                <th className="text-left p-2">Estado</th>
                <th className="text-left p-2">Detalhe</th>
                <th className="text-left p-2">Panic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {checks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-zinc-500">
                    {loading ? 'A carregar…' : 'Sem registos. Execute o cron ou aguarde a primeira passagem.'}
                  </td>
                </tr>
              ) : (
                checks.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-900/40">
                    <td className="p-2 text-zinc-500 whitespace-nowrap">
                      {new Date(c.checkedAt).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-2 font-mono text-zinc-200">{c.domainHost}</td>
                    <td className="p-2">
                      <span
                        className={
                          c.status === 'WARNING'
                            ? 'text-rose-400'
                            : c.status === 'OK'
                              ? 'text-emerald-400'
                              : 'text-zinc-400'
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="p-2 text-zinc-500 max-w-[280px] truncate" title={c.detail || ''}>
                      {c.detail || '—'}
                    </td>
                    <td className="p-2">{c.panicTriggered ? <span className="text-amber-400">Sim</span> : '—'}</td>
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
