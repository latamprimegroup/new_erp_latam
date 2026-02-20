'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

const DOC_LABELS: Record<string, string> = {
  RG_FRENTE: 'RG Frente',
  RG_VERSO: 'RG Verso',
  CARTAO_CNPJ: 'Cartão CNPJ',
  COMPROVANTE_ENDERECO: 'Comprovante Endereço',
  COMPROVANTE_OUTRO: 'Outro Comprovante',
}

const STATUS_LABELS: Record<string, string> = {
  PARA_CRIACAO: 'Para Criação',
  CRIANDO_GMAIL: 'Criando Gmail',
  CRIANDO_GOOGLE_ADS: 'Criando Google Ads',
  VINCULANDO_CNPJ: 'Vinculando CNPJ',
  CONFIGURANDO_PERFIL_PAGAMENTO: 'Config. Perfil Pagamento',
  EM_REVISAO: 'Em Revisão',
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
  ENVIADA_ESTOQUE: 'Enviada para Estoque',
  ARQUIVADA: 'Arquivada',
}

type Props = {
  item: {
    id: string
    taskName: string
    currency: string
    codeG2: string
    itemId: string
    status: string
    cnpjLink: string | null
    cnpjNumber: string | null
    siteUrl: string | null
    googleAdsCustomerId: string | null
    rejectedReason: string | null
    estimatedDeliveryHours: number | null
    creator: { name: string | null }
    client: { user: { name: string | null } } | null
    deliveryGroup: { groupNumber: string } | null
    emailConsumed?: { email: string } | null
    cnpjConsumed?: { cnpj: string } | null
    paymentProfileConsumed?: { type: string; gateway: string } | null
    credentials: {
      emailGoogle: string | null
      passwordEncrypted: string | null
      recoveryEmail: string | null
      twoFaSecret: string | null
      twoFaSms: string | null
    } | null
    auditLogs: { action: string; details: unknown; createdAt: string; userId: string }[]
    stockAccountId: string | null
  }
  sessionUserId: string
  canApprove: boolean
}

type DocInfo = { id: string; type: string; uploadedAt: string; hasBlockedReason?: boolean }
type Readiness = { canApprove: boolean; missingDocs: string[]; score: number; blockers: string[] }

export function ProductionG2DetailClient({ item, sessionUserId, canApprove }: Props) {
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const [credentials, setCredentials] = useState<typeof item.credentials>(null)
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState<DocInfo[]>([])
  const [readiness, setReadiness] = useState<Readiness | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [rentingSms, setRentingSms] = useState(false)
  const [rentedPhone, setRentedPhone] = useState<string | null>(item.credentials?.twoFaSms || null)

  const showDocs =
    !['APROVADA', 'ENVIADA_ESTOQUE', 'REPROVADA'].includes(item.status) ||
    docs.length > 0

  useEffect(() => {
    if (!item.id) return
    ;(async () => {
      const [docsRes, readyRes] = await Promise.all([
        fetch(`/api/production-g2/${item.id}/documents`),
        fetch(`/api/production-g2/${item.id}/approval-readiness`),
      ])
      if (docsRes.ok) setDocs(await docsRes.json())
      if (readyRes.ok) setReadiness(await readyRes.json())
    })()
  }, [item.id])

  async function handleApprove() {
    setLoading(true)
    const res = await fetch(`/api/production-g2/${item.id}/approve`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) window.location.reload()
    else {
      const msg = data.blockers?.length ? data.blockers.join('\n') : data.error
      alert(msg || 'Erro ao aprovar')
    }
    setLoading(false)
  }

  async function handleReject() {
    if (!rejectReason.trim()) return
    setLoading(true)
    const res = await fetch(`/api/production-g2/${item.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rejectedReason: rejectReason }),
    })
    if (res.ok) window.location.reload()
    else alert((await res.json()).error)
    setLoading(false)
  }

  async function handleSendToStock() {
    setLoading(true)
    const res = await fetch(`/api/production-g2/${item.id}/send-to-stock`, { method: 'POST' })
    if (res.ok) window.location.reload()
    else alert((await res.json()).error)
    setLoading(false)
  }

  async function handleRentSms() {
    setRentingSms(true)
    try {
      const res = await fetch('/api/admin/sms/rent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionG2Id: item.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setRentedPhone(data.phoneNumber)
        window.location.reload()
      } else {
        alert(data.error || 'Erro ao alugar número')
      }
    } finally {
      setRentingSms(false)
    }
  }

  async function viewCredentials() {
    const res = await fetch(`/api/production-g2/${item.id}/credentials`, { method: 'POST' })
    if (res.ok) setCredentials(await res.json())
    else alert((await res.json()).error || 'Erro ao carregar credenciais')
  }

  async function handleDocUpload(type: string, file: File) {
    if (!file) return
    setUploading(type)
    const fd = new FormData()
    fd.set('file', file)
    fd.set('type', type)
    const res = await fetch(`/api/production-g2/${item.id}/documents`, {
      method: 'POST',
      body: fd,
    })
    setUploading(null)
    if (res.ok) {
      const d = await res.json()
      setDocs((prev) => {
        const rest = prev.filter((x) => x.type !== type)
        return [...rest, { id: d.id, type: d.type, uploadedAt: d.uploadedAt }]
      })
      const [readyRes] = await Promise.all([
        fetch(`/api/production-g2/${item.id}/approval-readiness`),
      ])
      if (readyRes.ok) setReadiness(await readyRes.json())
    } else {
      const err = await res.json()
      alert(err.error || 'Erro no upload')
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/dashboard/producao-g2" className="text-primary-600 hover:underline text-sm">
        ← Voltar
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ads-antracite">
          {item.codeG2} — {item.taskName}
        </h1>
        <span
          className={`inline-flex px-3 py-1 rounded-lg text-sm font-medium ${
            item.status === 'APROVADA' || item.status === 'ENVIADA_ESTOQUE'
              ? 'bg-emerald-100 text-emerald-700'
              : item.status === 'REPROVADA'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-700'
          }`}
        >
          {STATUS_LABELS[item.status]}
        </span>
      </div>

      <div className="card grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-slate-500">Item ID</p>
          <p className="font-mono text-sm">{item.itemId}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Responsável</p>
          <p className="text-sm">{item.creator?.name || '-'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Moeda</p>
          <p className="text-sm">{item.currency}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Cliente</p>
          <p className="text-sm">{item.client?.user?.name || '-'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Grupo entrega</p>
          <p className="text-sm">{item.deliveryGroup?.groupNumber || '-'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">CNPJ</p>
          <p className="font-mono text-sm">{item.cnpjNumber || item.cnpjConsumed?.cnpj || '-'}</p>
        </div>
        {(item.emailConsumed || item.cnpjConsumed || item.paymentProfileConsumed) && (
          <div className="col-span-full">
            <p className="text-xs text-slate-500 mb-1">Base do estoque</p>
            <p className="text-sm">
              {item.emailConsumed && `Email: ${item.emailConsumed.email}`}
              {item.emailConsumed && (item.cnpjConsumed || item.paymentProfileConsumed) && ' · '}
              {item.cnpjConsumed && `CNPJ: ${item.cnpjConsumed.cnpj}`}
              {item.cnpjConsumed && item.paymentProfileConsumed && ' · '}
              {item.paymentProfileConsumed && `Perfil: ${item.paymentProfileConsumed.type} / ${item.paymentProfileConsumed.gateway}`}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500">Site</p>
          <p className="text-sm truncate max-w-[200px]" title={item.siteUrl || ''}>
            {item.siteUrl || '-'}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">ID Google Ads</p>
          <p className="font-mono text-sm">{item.googleAdsCustomerId || '-'}</p>
        </div>
      </div>

      {!['REPROVADA', 'ARQUIVADA'].includes(item.status) && (
        <div className="card">
          <h3 className="font-medium text-slate-700 mb-3">Validação SMS (Google)</h3>
          {rentedPhone || item.credentials?.twoFaSms ? (
            <p className="text-sm font-mono bg-gray-50 p-3 rounded">
              {rentedPhone || item.credentials?.twoFaSms}
            </p>
          ) : (
            <p className="text-sm text-slate-600 mb-2">
              Alugue um número para usar quando o Google pedir validação por SMS.
            </p>
          )}
          {!rentedPhone && !item.credentials?.twoFaSms && (
            <button
              onClick={handleRentSms}
              disabled={rentingSms}
              className="btn-secondary text-sm"
            >
              {rentingSms ? 'Alugando...' : 'Alugar número'}
            </button>
          )}
        </div>
      )}

      {item.credentials && (
        <div className="card">
          <h3 className="font-medium text-slate-700 mb-3">Credenciais</h3>
          {credentials ? (
            <div className="space-y-2 text-sm font-mono bg-gray-50 p-4 rounded-lg">
              <p><span className="text-slate-500">Email:</span> {credentials.emailGoogle}</p>
              <p><span className="text-slate-500">Senha:</span> {credentials.passwordEncrypted || '—'}</p>
              <p><span className="text-slate-500">Recovery:</span> {credentials.recoveryEmail || '—'}</p>
              <p><span className="text-slate-500">2FA:</span> {credentials.twoFaSecret || credentials.twoFaSms || '—'}</p>
              <p className="text-xs text-amber-600 mt-2">Visualização registrada em log de auditoria.</p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-600 mb-2">
                Email: {item.credentials.emailGoogle ? '••••' + (item.credentials.emailGoogle?.slice(-4) || '') : '—'}
              </p>
              <button
                onClick={viewCredentials}
                className="btn-secondary text-sm"
              >
                Visualizar credenciais (registra acesso)
              </button>
            </div>
          )}
        </div>
      )}

      {showDocs && (
        <div className="card">
          <h3 className="font-medium text-slate-700 mb-3">
            Documentos obrigatórios
            {readiness && (
              <span
                className={`ml-2 text-sm font-normal ${
                  readiness.canApprove ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {readiness.canApprove ? '✓ Completo' : `Faltam: ${readiness.missingDocs.join(', ')}`}
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {['RG_FRENTE', 'RG_VERSO', 'CARTAO_CNPJ'].map((t) => {
              const doc = docs.find((d) => d.type === t)
              const isUploading = uploading === t
              return (
                <div key={t} className="border border-gray-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-slate-700 mb-2">
                    {DOC_LABELS[t] || t}
                  </p>
                  {doc ? (
                    <div className="text-sm text-emerald-600 flex items-center gap-1">
                      <span>✓ Enviado</span>
                      <span className="text-slate-400">
                        {new Date(doc.uploadedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  ) : !['APROVADA', 'ENVIADA_ESTOQUE', 'REPROVADA'].includes(item.status) ? (
                    <label className="block">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        disabled={isUploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleDocUpload(t, f)
                          e.target.value = ''
                        }}
                      />
                      <span
                        className={`inline-flex px-2 py-1 rounded text-sm cursor-pointer ${
                          isUploading
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                        }`}
                      >
                        {isUploading ? 'Enviando...' : 'Enviar arquivo'}
                      </span>
                    </label>
                  ) : (
                    <span className="text-slate-400 text-sm">—</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {item.rejectedReason && (
        <div className="card border-red-200 bg-red-50/50">
          <p className="text-sm font-medium text-red-700">Motivo da reprovação</p>
          <p className="text-sm text-red-800 mt-1">{item.rejectedReason}</p>
        </div>
      )}

      {canApprove && (
        <div className="card flex flex-wrap gap-3">
          {item.status === 'EM_REVISAO' && (
            <>
              <button onClick={handleApprove} disabled={loading} className="btn-primary">
                Aprovar
              </button>
              {!showReject ? (
                <button onClick={() => setShowReject(true)} className="btn-secondary text-red-600">
                  Reprovar
                </button>
              ) : (
                <div className="flex gap-2 flex-1">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Motivo obrigatório"
                    className="flex-1 rounded border-gray-300 text-sm"
                  />
                  <button onClick={handleReject} disabled={!rejectReason.trim() || loading} className="btn-secondary">
                    Confirmar reprovação
                  </button>
                  <button onClick={() => setShowReject(false)} className="text-slate-600">Cancelar</button>
                </div>
              )}
            </>
          )}
          {item.status === 'APROVADA' && !item.stockAccountId && (
            <button onClick={handleSendToStock} disabled={loading} className="btn-primary">
              Enviar para Estoque
            </button>
          )}
        </div>
      )}

      {item.auditLogs && item.auditLogs.length > 0 && (
        <div className="card">
          <h3 className="font-medium text-slate-700 mb-3">Histórico</h3>
          <ul className="space-y-2 text-sm">
            {item.auditLogs.map((log, i) => (
              <li key={i} className="flex justify-between text-slate-600">
                <span>{log.action}</span>
                <span>{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
