'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { ADS_CORE_DUPLICATE_MSG, formatCnpjDisplay, normalizeAdsCoreCnpj } from '@/lib/ads-core-utils'

type NicheOpt = { id: string; name: string }
type ProducerOpt = { id: string; name: string | null; email: string | null }

type AssetDetail = {
  id: string
  nicheId: string
  producerId: string | null
  verificationTrack?: string
  cnpj: string
  razaoSocial: string | null
  nomeFantasia: string | null
  endereco: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  nomeSocio: string | null
  cpfSocio: string | null
  dataNascimentoSocio: string | null
  emailEmpresa: string | null
  telefone: string | null
  cnae: string | null
  cnaeDescricao: string | null
  statusReceita: string
  siteUrl: string | null
}

type Props = {
  open: boolean
  assetId: string | null
  niches: NicheOpt[]
  producers: ProducerOpt[]
  onClose: () => void
  onSaved: () => void
}

export function AdsCoreAssetEditorModal({ open, assetId, niches, producers, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [siteCheck, setSiteCheck] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle')
  const [siteMsg, setSiteMsg] = useState('')
  const [form, setForm] = useState<Partial<AssetDetail> | null>(null)

  const load = useCallback(async () => {
    if (!assetId) return
    setLoading(true)
    setError('')
    setSiteCheck('idle')
    setSiteMsg('')
    try {
      const res = await fetch(`/api/ads-core/assets/${assetId}`)
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Não foi possível carregar o ativo.')
        setForm(null)
        return
      }
      setForm(j as AssetDetail)
    } catch {
      setError('Falha de rede ao carregar.')
      setForm(null)
    } finally {
      setLoading(false)
    }
  }, [assetId])

  useEffect(() => {
    if (open && assetId) void load()
    if (!open) {
      setForm(null)
      setError('')
      setSiteCheck('idle')
      setSiteMsg('')
    }
  }, [open, assetId, load])

  async function checkSiteBlur() {
    if (!assetId || !form) return
    const raw = (form.siteUrl || '').trim()
    if (!raw) {
      setSiteCheck('idle')
      setSiteMsg('')
      return
    }
    setSiteCheck('checking')
    setSiteMsg('')
    const q = new URLSearchParams()
    q.set('siteUrl', raw)
    q.set('excludeAssetId', assetId)
    const res = await fetch(`/api/ads-core/assets/check-unique?${q.toString()}`)
    const j = (await res.json()) as { available?: boolean; message?: string }
    if (!res.ok || !j.available) {
      setSiteCheck('bad')
      setSiteMsg(j.message || ADS_CORE_DUPLICATE_MSG)
      return
    }
    setSiteCheck('ok')
    setSiteMsg('')
  }

  async function save() {
    if (!assetId || !form) return
    setSaving(true)
    setError('')
    try {
      const cpfDigits = (form.cpfSocio || '').replace(/\D/g, '')
      const dob =
        form.dataNascimentoSocio &&
        !Number.isNaN(new Date(form.dataNascimentoSocio).getTime())
          ? new Date(form.dataNascimentoSocio).toISOString()
          : null
      const body = {
        nicheId: form.nicheId,
        producerId: form.producerId === '' ? null : form.producerId,
        verificationTrack: (form.verificationTrack || 'G2_ANUNCIANTE') as
          | 'G2_ANUNCIANTE'
          | 'ANUNCIANTE_COMERCIAL',
        razaoSocial: form.razaoSocial?.trim() || null,
        nomeFantasia: form.nomeFantasia?.trim() || null,
        endereco: form.endereco?.trim() || null,
        logradouro: form.logradouro?.trim() || null,
        numero: form.numero?.trim() || null,
        bairro: form.bairro?.trim() || null,
        cidade: form.cidade?.trim() || null,
        estado: form.estado?.trim()?.toUpperCase().slice(0, 2) || null,
        cep: form.cep?.replace(/\D/g, '') || null,
        nomeSocio: form.nomeSocio?.trim() || null,
        cpfSocio: cpfDigits.length ? cpfDigits : null,
        dataNascimentoSocio: dob,
        emailEmpresa: form.emailEmpresa?.trim() || null,
        telefone: form.telefone?.trim() || null,
        cnae: form.cnae?.trim() || null,
        cnaeDescricao: form.cnaeDescricao?.trim() || null,
        statusReceita: form.statusReceita?.trim() || null,
        siteUrl: form.siteUrl?.trim() || null,
      }
      const res = await fetch(`/api/ads-core/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || 'Não foi possível salvar.')
        return
      }
      onSaved()
      onClose()
    } catch {
      setError('Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-asset-title"
    >
      <div className="w-full max-w-2xl max-h-[min(92vh,880px)] overflow-y-auto rounded-2xl border border-white/15 bg-zinc-950 text-gray-100 shadow-2xl p-5 space-y-4">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h2 id="edit-asset-title" className="text-lg font-semibold text-white">
              Editar ativo
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              CNPJ não pode ser alterado (unicidade e registro). Demais campos podem ser ajustados pelo gerente.
            </p>
          </div>
          <button
            type="button"
            className="p-1 rounded hover:bg-white/10 text-gray-400"
            onClick={() => !saving && onClose()}
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && <p className="text-sm text-gray-400">Carregando…</p>}
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        {form && !loading && (
          <>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
              <p className="text-xs text-gray-500">CNPJ (somente leitura)</p>
              <p className="font-mono text-primary-300">
                {formatCnpjDisplay(normalizeAdsCoreCnpj(form.cnpj ?? ''))}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nicho</label>
                <select
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.nicheId || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, nicheId: e.target.value } : f))}
                >
                  {niches.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Meta de verificação</label>
                <select
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.verificationTrack || 'G2_ANUNCIANTE'}
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            verificationTrack: e.target.value as AssetDetail['verificationTrack'],
                          }
                        : f
                    )
                  }
                >
                  <option value="G2_ANUNCIANTE">G2 + Verificação de Anunciante</option>
                  <option value="ANUNCIANTE_COMERCIAL">Verificação de Anunciante + Operações Comerciais</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Produtor atribuído</label>
                <select
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.producerId ?? ''}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, producerId: e.target.value || null } : f))
                  }
                >
                  <option value="">— Estoque (sem produtor)</option>
                  {producers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.name || p.email || p.id).trim()}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-1">
                  Retirar do produtor (voltar ao estoque) é permitido. Passar de um produtor para outro já atribuído
                  exige perfil administrador.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-gray-500">Razão social</label>
              <input
                className="input-field w-full text-sm bg-zinc-900 border-white/10"
                value={form.razaoSocial || ''}
                onChange={(e) => setForm((f) => (f ? { ...f, razaoSocial: e.target.value } : f))}
              />
              <label className="block text-xs text-gray-500">Nome fantasia</label>
              <input
                className="input-field w-full text-sm bg-zinc-900 border-white/10"
                value={form.nomeFantasia || ''}
                onChange={(e) => setForm((f) => (f ? { ...f, nomeFantasia: e.target.value } : f))}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Site / URL</label>
              <input
                type="url"
                className="input-field w-full text-sm bg-zinc-900 border-white/10"
                value={form.siteUrl || ''}
                onChange={(e) => {
                  setForm((f) => (f ? { ...f, siteUrl: e.target.value } : f))
                  setSiteCheck('idle')
                  setSiteMsg('')
                }}
                onBlur={() => void checkSiteBlur()}
                placeholder="https://..."
              />
              {siteCheck === 'checking' && <p className="text-xs text-gray-500 mt-1">Verificando unicidade…</p>}
              {siteCheck === 'ok' && (form.siteUrl || '').trim() && (
                <p className="text-xs text-green-400 mt-1">URL disponível para este ativo.</p>
              )}
              {siteMsg && (
                <p className="text-xs text-amber-400 mt-1" role="status">
                  {siteMsg}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Endereço (texto completo)</label>
              <textarea
                className="input-field w-full text-sm min-h-[72px] bg-zinc-900 border-white/10 resize-y"
                value={form.endereco || ''}
                onChange={(e) => setForm((f) => (f ? { ...f, endereco: e.target.value } : f))}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Logradouro</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.logradouro || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, logradouro: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nº</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.numero || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, numero: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Bairro</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.bairro || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, bairro: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cidade</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.cidade || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, cidade: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">UF</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10 max-w-[4rem]"
                  maxLength={2}
                  value={form.estado || ''}
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, estado: e.target.value.toUpperCase() } : f))
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">CEP</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.cep || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, cep: e.target.value } : f))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">E-mail empresa</label>
                <input
                  type="email"
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.emailEmpresa || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, emailEmpresa: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Telefone</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.telefone || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, telefone: e.target.value } : f))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">CNAE</label>
                <input
                  className="input-field w-full text-sm font-mono bg-zinc-900 border-white/10"
                  value={form.cnae || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, cnae: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Situação Receita</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.statusReceita || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, statusReceita: e.target.value } : f))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Descrição CNAE</label>
                <textarea
                  className="input-field w-full text-sm min-h-[56px] bg-zinc-900 border-white/10 resize-y"
                  value={form.cnaeDescricao || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, cnaeDescricao: e.target.value } : f))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome sócio</label>
                <input
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={form.nomeSocio || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, nomeSocio: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">CPF sócio</label>
                <input
                  className="input-field w-full text-sm font-mono bg-zinc-900 border-white/10"
                  value={form.cpfSocio || ''}
                  onChange={(e) => setForm((f) => (f ? { ...f, cpfSocio: e.target.value } : f))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nascimento sócio</label>
                <input
                  type="date"
                  className="input-field w-full text-sm bg-zinc-900 border-white/10"
                  value={
                    form.dataNascimentoSocio
                      ? form.dataNascimentoSocio.slice(0, 10)
                      : ''
                  }
                  onChange={(e) =>
                    setForm((f) =>
                      f
                        ? {
                            ...f,
                            dataNascimentoSocio: e.target.value
                              ? `${e.target.value}T12:00:00.000Z`
                              : null,
                          }
                        : f
                    )
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                className="btn-secondary text-sm"
                disabled={saving}
                onClick={() => onClose()}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={saving || siteCheck === 'bad'}
                onClick={() => void save()}
              >
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
