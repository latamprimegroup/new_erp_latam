'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ClipboardCopy, Loader2, Shield, Sparkles } from 'lucide-react'
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

type Uni = { id: string; displayName: string | null; primaryDomainHost: string | null; riskLevel: string }

type LinkRow = {
  id: string
  label: string | null
  destinationUrl: string
  protectionNiche: string
  shieldProfile: string
  uni: { id: string; displayName: string | null; primaryDomainHost: string | null }
  offer: { id: string; name: string; platform: string; status: string; paySlug: string }
  shieldPayUrl: string | null
  adsFinalUrl: string | null
  adsWarnings: string[]
  postbackUrl: string | null
}

type Overview = {
  unis: Uni[]
  links: LinkRow[]
  shieldStats24h: { allowed: number; blocked: number; windowHours: number }
  nicheOptions: string[]
  profileOptions: { value: string; label: string; hint: string }[]
  checkoutPlatforms: { id: string; label: string }[]
  trackingNote: string
}

const NICHE_PT: Record<string, string> = {
  SAUDE: 'Saúde',
  FINANCEIRO: 'Financeiro',
  BLACK: 'Black',
  ECOMMERCE: 'E-commerce',
  EDUCACAO: 'Educação',
  GERAL: 'Geral',
}

function copyText(s: string) {
  void navigator.clipboard.writeText(s)
}

export function ShieldTrackerClient() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [uniId, setUniId] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')
  const [niche, setNiche] = useState('GERAL')
  const [profile, setProfile] = useState<'SAFE' | 'MONEY'>('MONEY')
  const [platform, setPlatform] = useState('KIWIFY')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [guidePlatform, setGuidePlatform] = useState('KIWIFY')
  const [simBusy, setSimBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    setErr(null)
    fetch('/api/cliente/shield-tracker/overview')
      .then((r) => {
        if (!r.ok) throw new Error('load')
        return r.json() as Promise<Overview>
      })
      .then((d) => {
        setData(d)
        setUniId((prev) => (prev ? prev : d.unis[0]?.id || ''))
      })
      .catch(() => setErr('Não foi possível carregar o Shield & Tracker.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = new URLSearchParams(window.location.search)
    const checkout = q.get('checkout')
    const plat = q.get('platform')
    const lbl = q.get('label')
    const allowedPlat = new Set(['KIWIFY', 'HOTMART', 'EDUZZ', 'KIRVANO', 'PERFECT_PAY', 'OTHER'])
    if (checkout) setDestinationUrl((prev) => (prev ? prev : checkout))
    if (plat && allowedPlat.has(plat)) setPlatform(plat)
    if (lbl) setLabel((prev) => (prev ? prev : lbl))
  }, [])

  const chartData = useMemo(() => {
    if (!data) return []
    return [
      {
        name: `Últimas ${data.shieldStats24h.windowHours}h`,
        Limpo: data.shieldStats24h.allowed,
        Bloqueado: data.shieldStats24h.blocked,
      },
    ]
  }, [data])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const r = await fetch('/api/cliente/shield-tracker/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniId,
          destinationUrl: destinationUrl.trim(),
          protectionNiche: niche,
          shieldProfile: profile,
          platform,
          label: label.trim() || undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Erro ao criar')
      setDestinationUrl('')
      setLabel('')
      load()
      alert('Link blindado criado. Copie a URL final e o postback abaixo.')
    } catch (ex: unknown) {
      alert(ex instanceof Error ? ex.message : 'Erro')
    } finally {
      setSubmitting(false)
    }
  }

  async function simulateSale(offerId: string) {
    setSimBusy(offerId)
    try {
      const r = await fetch(`/api/cliente/shield-tracker/simulate/${offerId}`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        alert(j.error || 'Falha na simulação')
        return
      }
      alert(
        j.ok
          ? `Sinal OK (HTTP ${j.httpStatus}). transaction_id: ${j.transactionId}`
          : `Resposta HTTP ${j.httpStatus}. Pré-visualização: ${j.responsePreview?.slice(0, 200)}`
      )
      load()
    } finally {
      setSimBusy(null)
    }
  }

  async function removeLink(id: string) {
    if (!confirm('Remover este link e a oferta associada? Esta ação não pode ser desfeita.')) return
    const r = await fetch(`/api/cliente/shield-tracker/link/${id}`, { method: 'DELETE' })
    if (r.ok) load()
    else alert('Não foi possível remover')
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20 text-gray-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (!data) {
    return <p className="p-8 text-red-600">{err || 'Erro'}</p>
  }

  const examplePostback =
    data.links[0]?.postbackUrl ||
    `${typeof window !== 'undefined' ? window.location.origin : ''}/api/public/tracker-offers/webhook/«token»`

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-10">
      <div>
        <p className="text-sm font-medium text-primary-600 dark:text-primary-400 flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Módulo 04 — Shield &amp; Tracker
        </p>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">Blindagem de tráfego</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-2xl">
          Cole o teu checkout ou VSL: geramos o <strong>/pay</strong> rastreado, o postback S2S e a URL final para o Google Ads com ValueTrack (
          <code className="text-xs">campaignid</code>, <code className="text-xs">adgroupid</code>, auto{' '}
          <code className="text-xs">gclid</code>).
        </p>
        <Link href="/dashboard/cliente/ads-war-room" className="text-sm text-primary-600 dark:text-primary-400 mt-2 inline-block hover:underline">
          Ver UNIs na War Room
        </Link>
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}

      {data.unis.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-100">
          Ainda não tens UNI atribuída. O domínio blindado vem do campo <strong>primary_domain_host</strong> da tua UNI — pede à equipa para associar o teu acesso.
        </div>
      )}

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-500" />
          Gerador de links blindados
        </h2>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm space-y-1 sm:col-span-2">
            <span className="text-gray-600 dark:text-gray-400">UNI (identidade)</span>
            <select
              required
              value={uniId}
              onChange={(e) => setUniId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            >
              {data.unis.length === 0 ? (
                <option value="">—</option>
              ) : (
                data.unis.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName || u.id.slice(0, 8)} — {u.primaryDomainHost || 'sem domínio (usa URL da app)'}
                  </option>
                ))
              )}
            </select>
          </label>
          <label className="text-sm space-y-1 sm:col-span-2">
            <span className="text-gray-600 dark:text-gray-400">URL de destino (checkout / afiliado / VSL monetária)</span>
            <input
              required
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://pay..."
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            />
          </label>
          <label className="text-sm space-y-1">
            <span className="text-gray-600 dark:text-gray-400">Nicho de proteção (regras no edge)</span>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            >
              {data.nicheOptions.map((n) => (
                <option key={n} value={n}>
                  {NICHE_PT[n] || n}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="text-gray-600 dark:text-gray-400">Plataforma de checkout (postback)</span>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            >
              {data.checkoutPlatforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="sm:col-span-2 space-y-2">
            <legend className="text-sm text-gray-600 dark:text-gray-400">Cloaking silencioso (perfil no edge)</legend>
            <div className="flex flex-col gap-2">
              {data.profileOptions.map((p) => (
                <label key={p.value} className="flex items-start gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="prof"
                    checked={profile === p.value}
                    onChange={() => setProfile(p.value as 'SAFE' | 'MONEY')}
                  />
                  <span>
                    <span className="font-medium text-gray-900 dark:text-white">{p.label}</span>
                    <span className="block text-xs text-gray-500">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm space-y-1 sm:col-span-2">
            <span className="text-gray-600 dark:text-gray-400">Nome interno (opcional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-black/30 px-3 py-2 text-sm dark:text-white"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting || !uniId}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Gerar URL blindada + postback
            </button>
          </div>
        </form>
        <p className="text-xs text-gray-500 dark:text-gray-400">{data.trackingNote}</p>
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Inteligência de cliques (Traffic Shield)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Agregado das tuas UNIs — tráfego que passou vs bloqueios reportados pelo edge (bots / auditores / datacenter).
        </p>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Limpo" fill="#22c55e" name="Tráfego limpo (ALLOWED)" />
              <Bar dataKey="Bloqueado" fill="#ef4444" name="Bloqueado (BLOCKED)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {(data.shieldStats24h.allowed === 0 && data.shieldStats24h.blocked === 0) && (
          <p className="text-xs text-gray-500">
            Sem eventos nas últimas 24h. Quando o edge enviar logs para o ERP (ingest Traffic Shield), os números aparecem aqui.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-5 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Postback S2S (guia visual)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          1) Escolhe a plataforma. 2) Cola a URL única de webhook na área de integrações da plataforma. 3) Garante que o checkout recebe{' '}
          <code className="text-xs">gclid</code> / UTMs (o nosso <strong>/pay</strong> reencaminha os parâmetros permitidos).
        </p>
        <div className="flex flex-wrap gap-2">
          {data.checkoutPlatforms.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setGuidePlatform(p.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                guidePlatform === p.id ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-white/10'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="rounded-lg bg-gray-50 dark:bg-white/5 p-4 text-sm space-y-2">
          <p>
            <strong>URL do webhook</strong> (exemplo com a tua primeira oferta):
          </p>
          <code className="block text-xs break-all bg-white dark:bg-black/40 p-2 rounded border dark:border-white/10">
            {data.links[0]?.postbackUrl || examplePostback}
          </code>
          <p className="text-xs text-gray-500">
            Plataforma selecionada para referência: <strong>{guidePlatform}</strong>. Ajusta o corpo JSON conforme a documentação oficial
            (Hotmart, Kiwify, etc.) — o nosso endpoint aceita JSON e form-url-encoded e extrai gclid, valor e estado de pagamento.
          </p>
          <button
            type="button"
            className="text-xs text-primary-600 dark:text-primary-400 underline"
            onClick={() => data.links[0]?.postbackUrl && copyText(data.links[0].postbackUrl)}
          >
            Copiar URL de exemplo
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Os teus links blindados</h2>
        {data.links.length === 0 ? (
          <p className="text-sm text-gray-500">Ainda não criaste nenhum link.</p>
        ) : (
          <ul className="space-y-4">
            {data.links.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 p-4 space-y-3 text-sm"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{row.label || row.offer.name}</p>
                    <p className="text-xs text-gray-500">
                      {row.uni.displayName || row.uni.id.slice(0, 8)} · {NICHE_PT[row.protectionNiche] || row.protectionNiche} ·{' '}
                      {row.shieldProfile === 'SAFE' ? 'Safe Page' : 'Oferta'} · {row.offer.platform}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-600 underline"
                    onClick={() => removeLink(row.id)}
                  >
                    Remover
                  </button>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500">URL blindada (pay + shield)</p>
                  <div className="flex gap-2 items-start">
                    <code className="flex-1 text-xs break-all bg-gray-50 dark:bg-white/5 p-2 rounded">{row.shieldPayUrl || '—'}</code>
                    {row.shieldPayUrl && (
                      <button type="button" aria-label="Copiar" onClick={() => copyText(row.shieldPayUrl!)}>
                        <ClipboardCopy className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500">URL final sugerida (Google Ads — com ValueTrack)</p>
                  <div className="flex gap-2 items-start">
                    <code className="flex-1 text-xs break-all bg-gray-50 dark:bg-white/5 p-2 rounded">{row.adsFinalUrl || '—'}</code>
                    {row.adsFinalUrl && (
                      <button type="button" aria-label="Copiar" onClick={() => copyText(row.adsFinalUrl!)}>
                        <ClipboardCopy className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                  </div>
                  {row.adsWarnings.length > 0 && (
                    <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc pl-4">
                      {row.adsWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500">Postback único</p>
                  <div className="flex gap-2 items-start">
                    <code className="flex-1 text-xs break-all bg-gray-50 dark:bg-white/5 p-2 rounded">
                      {row.postbackUrl || 'Configure NEXT_PUBLIC_APP_URL'}
                    </code>
                    {row.postbackUrl && (
                      <button type="button" aria-label="Copiar" onClick={() => copyText(row.postbackUrl!)}>
                        <ClipboardCopy className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={simBusy === row.offer.id}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-white/15 px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                  onClick={() => simulateSale(row.offer.id)}
                >
                  {simBusy === row.offer.id && <Loader2 className="w-3 h-3 animate-spin" />}
                  Simular venda (teste S2S)
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
