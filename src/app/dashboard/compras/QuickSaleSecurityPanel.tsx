'use client'

import { type FormEvent, useCallback, useEffect, useState } from 'react'

type SecurityPayload = {
  minValueForKycBrl: number
  linkExpirationTime: number
  linkExpirationMin: number
  linkExpirationMax: number
  suspiciousEmailDomains: string[]
  antiFraudBlocks: number
  linkSharingAttempts: number
  recentLinkSharingAttempts: Array<{
    id: string
    createdAt: string
    token: string | null
    checkoutId: string | null
    listingId: string | null
    ip: string | null
    originalIp: string | null
    sharingAttemptIp: string | null
    userAgent: string | null
  }>
  pendingKycCount: number
  adspowerGroupMap: Record<string, string>
  utmifyTokenPreview: string | null
}

type SharingPeriod = '24h' | '7d' | '30d'

type PendingKycItem = {
  id: string
  buyerName: string
  buyerCpf: string
  buyerEmail: string | null
  buyerWhatsapp: string
  qty: number
  totalAmount: number
  updatedAt: string
  paidAt: string | null
  deliveryStatusNote: string | null
  listing: {
    id: string
    title: string
    slug: string
  }
  kyc: {
    riskReasons: string[]
    minValueForKyc: number | null
    submitted: boolean
    fileMeta?: {
      documentPath?: string | null
      selfiePath?: string | null
      uploadedAt?: string
    } | null
  }
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function reasonLabel(reason: string) {
  if (reason === 'AMOUNT_ABOVE_KYC') return 'Valor acima do limite KYC'
  if (reason === 'SUSPICIOUS_EMAIL_DOMAIN') return 'E-mail com dominio suspeito'
  if (reason === 'BLACKLISTED_IDENTITY') return 'Identidade em blacklist global'
  return reason
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'
  return date.toLocaleString('pt-BR')
}

export function QuickSaleSecurityPanel() {
  const [security, setSecurity] = useState<SecurityPayload | null>(null)
  const [pendingKyc, setPendingKyc] = useState<PendingKycItem[]>([])
  const [showSharingAttempts, setShowSharingAttempts] = useState(false)
  const [sharingPeriod, setSharingPeriod] = useState<SharingPeriod>('24h')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actingCheckoutId, setActingCheckoutId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [minValueForKycBrl, setMinValueForKycBrl] = useState('300')
  const [linkExpirationTime, setLinkExpirationTime] = useState('60')
  const [suspiciousDomainsText, setSuspiciousDomainsText] = useState('')
  const [utmifyTokenInput, setUtmifyTokenInput] = useState('')
  const [adspowerGroupMapText, setAdspowerGroupMapText] = useState('{\n  \n}')

  const downloadSharingCsv = useCallback(() => {
    const rows = security?.recentLinkSharingAttempts ?? []
    if (rows.length === 0) {
      setMessage('Não há tentativas para exportar no período selecionado.')
      return
    }

    const escapeCsv = (value: string | null | undefined) => {
      const raw = String(value ?? '')
      return `"${raw.replace(/"/g, '""')}"`
    }
    const headers = [
      'id',
      'createdAt',
      'token',
      'checkoutId',
      'listingId',
      'ip',
      'originalIp',
      'sharingAttemptIp',
      'userAgent',
    ]
    const csv = [
      headers.join(','),
      ...rows.map((item) => ([
        escapeCsv(item.id),
        escapeCsv(item.createdAt),
        escapeCsv(item.token),
        escapeCsv(item.checkoutId),
        escapeCsv(item.listingId),
        escapeCsv(item.ip),
        escapeCsv(item.originalIp),
        escapeCsv(item.sharingAttemptIp),
        escapeCsv(item.userAgent),
      ].join(','))),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `tentativas-compartilhamento-${sharingPeriod}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    setMessage(`CSV exportado com ${rows.length} registro(s).`)
  }, [security?.recentLinkSharingAttempts, sharingPeriod])

  const fillForm = useCallback((payload: SecurityPayload) => {
    setMinValueForKycBrl(String(payload.minValueForKycBrl))
    setLinkExpirationTime(String(payload.linkExpirationTime))
    setSuspiciousDomainsText(payload.suspiciousEmailDomains.join('\n'))
    setAdspowerGroupMapText(JSON.stringify(payload.adspowerGroupMap, null, 2))
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const [securityRes, kycRes] = await Promise.all([
        fetch(`/api/admin/quick-sale/security?period=${sharingPeriod}&limit=50`, { cache: 'no-store' }),
        fetch('/api/admin/quick-sale/kyc?limit=30', { cache: 'no-store' }),
      ])

      if (!securityRes.ok) {
        const json = await securityRes.json().catch(() => ({})) as { error?: string }
        throw new Error(json.error ?? 'Nao foi possivel carregar painel de seguranca.')
      }

      const securityData = await securityRes.json() as SecurityPayload
      setSecurity(securityData)
      fillForm(securityData)

      if (kycRes.ok) {
        const kycData = await kycRes.json() as { items?: PendingKycItem[] }
        setPendingKyc(kycData.items ?? [])
      } else {
        setPendingKyc([])
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar modulo de seguranca.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [fillForm, sharingPeriod])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSaveSecurity = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const parsedMin = Number(String(minValueForKycBrl).replace(',', '.'))
      if (!Number.isFinite(parsedMin) || parsedMin <= 0) {
        throw new Error('Informe um valor valido para o limite minimo de KYC.')
      }
      const parsedLinkExpiration = Number.parseInt(String(linkExpirationTime).trim(), 10)
      const minAllowed = security?.linkExpirationMin ?? 15
      const maxAllowed = security?.linkExpirationMax ?? 120
      if (!Number.isFinite(parsedLinkExpiration) || parsedLinkExpiration < minAllowed || parsedLinkExpiration > maxAllowed) {
        throw new Error(`LINK_EXPIRATION_TIME deve ficar entre ${minAllowed} e ${maxAllowed} minutos.`)
      }

      let parsedMap: Record<string, string> = {}
      try {
        parsedMap = JSON.parse(adspowerGroupMapText || '{}') as Record<string, string>
      } catch {
        throw new Error('Mapa AdsPower invalido. Use JSON no formato {"product_id":"group_id"}.')
      }

      const suspiciousEmailDomains = suspiciousDomainsText
        .split(/\n|,/g)
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)

      const body = {
        minValueForKycBrl: parsedMin,
        linkExpirationTime: parsedLinkExpiration,
        suspiciousEmailDomains,
        adspowerGroupMap: parsedMap,
        utmifyToken: utmifyTokenInput.trim() ? utmifyTokenInput.trim() : undefined,
      }

      const res = await fetch('/api/admin/quick-sale/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({})) as SecurityPayload & { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Nao foi possivel salvar configuracoes de seguranca.')

      setSecurity(json)
      fillForm(json)
      setUtmifyTokenInput('')
      setMessage('Configuracoes de seguranca atualizadas com sucesso.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao salvar configuracoes.'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleKycDecision = async (checkoutId: string, action: 'APPROVE' | 'REJECT') => {
    setActingCheckoutId(checkoutId)
    setError('')
    setMessage('')
    try {
      const note = action === 'REJECT'
        ? window.prompt('Motivo da rejeicao KYC (opcional):') ?? undefined
        : undefined
      const res = await fetch('/api/admin/quick-sale/kyc', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId, action, note }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Falha ao processar KYC.')

      setMessage(action === 'APPROVE' ? 'KYC aprovado e checkout liberado.' : 'KYC rejeitado com sucesso.')
      await loadData()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao decidir KYC.'
      setError(msg)
    } finally {
      setActingCheckoutId(null)
    }
  }

  if (loading) {
    return (
      <section className="border border-zinc-800 rounded-2xl p-5 bg-zinc-900/40">
        <p className="text-sm text-zinc-400">Carregando SmartDeliverySystem...</p>
      </section>
    )
  }

  return (
    <section className="border border-violet-500/30 rounded-2xl p-5 bg-violet-500/5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-white">SmartDeliverySystem (Visão CEO)</h3>
          <p className="text-xs text-zinc-400">
            Regra de gatilho KYC, antifraude, blacklist e aprovacao manual.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { void loadData() }}
          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800 text-xs transition"
        >
          Atualizar painel
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>
      ) : null}
      {message ? (
        <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">{message}</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Limite atual KYC</p>
          <p className="text-white text-lg font-bold">
            {formatMoney(Number(security?.minValueForKycBrl ?? 300))}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Fila KYC pendente</p>
          <p className="text-amber-300 text-lg font-bold">{security?.pendingKycCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Bloqueios Kill Switch</p>
          <p className="text-red-300 text-lg font-bold">{security?.antiFraudBlocks ?? 0}</p>
        </div>
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Tentativas de compartilhamento</p>
          <p className="text-fuchsia-300 text-lg font-bold">{security?.linkSharingAttempts ?? 0}</p>
          <button
            type="button"
            onClick={() => setShowSharingAttempts((prev) => !prev)}
            className="mt-2 text-[11px] px-2 py-1 rounded-md border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/10 transition"
          >
            {showSharingAttempts ? 'Ocultar últimas tentativas' : 'Ver últimas tentativas'}
          </button>
        </div>
      </div>

      {showSharingAttempts ? (
        <section className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-fuchsia-200">Últimas tentativas de compartilhamento de link</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border border-zinc-700 overflow-hidden">
                {(['24h', '7d', '30d'] as SharingPeriod[]).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setSharingPeriod(period)}
                    className={`px-2 py-1 text-[11px] transition ${
                      sharingPeriod === period
                        ? 'bg-fuchsia-500/20 text-fuchsia-200'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={downloadSharingCsv}
                className="text-[11px] px-2 py-1 rounded-md border border-fuchsia-500/40 text-fuchsia-200 hover:bg-fuchsia-500/10 transition"
              >
                Exportar CSV
              </button>
              <span className="text-[11px] text-zinc-400">
                Exibindo {security?.recentLinkSharingAttempts?.length ?? 0} registros
              </span>
            </div>
          </div>
          {security?.recentLinkSharingAttempts && security.recentLinkSharingAttempts.length > 0 ? (
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {security.recentLinkSharingAttempts.map((attempt) => (
                <article key={attempt.id} className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-xs text-zinc-300">
                        <span className="text-zinc-500">Data:</span>{' '}
                        {new Date(attempt.createdAt).toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-zinc-300 break-all">
                        <span className="text-zinc-500">Token:</span> {attempt.token ?? '—'}
                      </p>
                      <p className="text-xs text-zinc-300 break-all">
                        <span className="text-zinc-500">IP original:</span> {attempt.originalIp ?? '—'} {' · '}
                        <span className="text-zinc-500">IP tentativa:</span> {attempt.sharingAttemptIp ?? attempt.ip ?? '—'}
                      </p>
                      <p className="text-xs text-zinc-300 break-all">
                        <span className="text-zinc-500">Checkout:</span> {attempt.checkoutId ?? '—'} {' · '}
                        <span className="text-zinc-500">Listing:</span> {attempt.listingId ?? '—'}
                      </p>
                    </div>
                    {attempt.checkoutId ? (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(attempt.checkoutId as string)
                          setMessage(`Checkout ${attempt.checkoutId} copiado.`)
                        }}
                        className="text-[11px] px-2 py-1 rounded-md border border-zinc-600 text-zinc-200 hover:bg-zinc-800 transition"
                      >
                        Copiar checkoutId
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Nenhuma tentativa registrada até o momento.</p>
          )}
        </section>
      ) : null}

      <form onSubmit={handleSaveSecurity} className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
        <h4 className="text-sm font-semibold text-white">Configuracao global de seguranca</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400 uppercase tracking-wider">Exigir verificacao para vendas acima de (BRL)</span>
            <input
              type="number"
              min="1"
              step="0.01"
              value={minValueForKycBrl}
              onChange={(e) => setMinValueForKycBrl(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-zinc-400 uppercase tracking-wider">LINK_EXPIRATION_TIME (minutos)</span>
            <input
              type="number"
              min={security?.linkExpirationMin ?? 15}
              max={security?.linkExpirationMax ?? 120}
              step="1"
              value={linkExpirationTime}
              onChange={(e) => setLinkExpirationTime(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white"
            />
            <span className="text-[11px] text-zinc-500">
              Intervalo permitido: {security?.linkExpirationMin ?? 15} a {security?.linkExpirationMax ?? 120} minutos (padrão 60).
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-zinc-400 uppercase tracking-wider">Novo token Utmify (opcional)</span>
            <input
              type="password"
              value={utmifyTokenInput}
              onChange={(e) => setUtmifyTokenInput(e.target.value)}
              placeholder="Deixe em branco para manter atual"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white"
            />
            <span className="text-[11px] text-zinc-500">
              Token atual: {security?.utmifyTokenPreview ?? 'nao configurado'}
            </span>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-zinc-400 uppercase tracking-wider">
            Dominios suspeitos de e-mail (1 por linha)
          </span>
          <textarea
            rows={4}
            value={suspiciousDomainsText}
            onChange={(e) => setSuspiciousDomainsText(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-zinc-400 uppercase tracking-wider">
            Mapa product_id - group_id AdsPower (JSON)
          </span>
          <textarea
            rows={6}
            value={adspowerGroupMapText}
            onChange={(e) => setAdspowerGroupMapText(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-xs text-white font-mono"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-60 transition"
        >
          {saving ? 'Salvando...' : 'Salvar configuracoes de seguranca'}
        </button>
      </form>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-white">Lista de KYC pendente</h4>
        {pendingKyc.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum checkout em PENDING_KYC no momento.</p>
        ) : (
          <div className="grid gap-3">
            {pendingKyc.map((item) => (
              <article key={item.id} className="rounded-xl border border-zinc-700 bg-zinc-900/70 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.listing.title}</p>
                    <p className="text-xs text-zinc-400">
                      Pedido #{item.id} · Cliente: {item.buyerName} · Valor: {formatMoney(item.totalAmount)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.buyerCpf} · {item.buyerEmail || 'sem email'} · {item.buyerWhatsapp}
                    </p>
                  </div>
                  <span className="text-[11px] px-2 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
                    {item.kyc.submitted ? 'KYC enviado' : 'Aguardando upload'}
                  </span>
                </div>

                {item.kyc.riskReasons.length > 0 ? (
                  <p className="text-xs text-zinc-300">
                    Motivos: {item.kyc.riskReasons.map(reasonLabel).join(' · ')}
                  </p>
                ) : null}
                {item.deliveryStatusNote ? (
                  <p className="text-xs text-zinc-500">Status: {item.deliveryStatusNote}</p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { void handleKycDecision(item.id, 'APPROVE') }}
                    disabled={actingCheckoutId === item.id}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60 transition"
                  >
                    {actingCheckoutId === item.id ? 'Processando...' : 'Aprovar KYC'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleKycDecision(item.id, 'REJECT') }}
                    disabled={actingCheckoutId === item.id}
                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-60 transition"
                  >
                    Rejeitar KYC
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

