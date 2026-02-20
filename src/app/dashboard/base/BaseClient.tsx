'use client'

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/Skeleton'

type Tab = 'emails' | 'cnpjs' | 'perfis'

type Email = {
  id: string
  email: string
  recovery: string | null
  status: string
  account: { platform: string; type: string } | null
  supplier: { id: string; name: string } | null
  batch: { id: string; filename: string; createdAt: string } | null
  productionAccount?: {
    id: string
    platform: string
    type: string
    status: string
    createdAt: string
    producer: { id: string; name: string | null; email: string }
  } | null
}

type Supplier = { id: string; name: string }

type Cnpj = {
  id: string
  cnpj: string
  razaoSocial: string | null
  cnae: string | null
  status: string
  account: { platform: string; type: string } | null
}

type Perfil = {
  id: string
  type: string
  gateway: string
  status: string
  cnpj: { cnpj: string; razaoSocial: string | null } | null
  account: { platform: string } | null
}

export function BaseClient() {
  const [tab, setTab] = useState<Tab>('emails')
  const [emails, setEmails] = useState<Email[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [cnpjs, setCnpjs] = useState<Cnpj[]>([])
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  const emailForm = { email: '', recovery: '', password: '', status: 'active', accountId: '', supplierId: '' }
  const cnpjForm = { cnpj: '', razaoSocial: '', nomeFantasia: '', cnae: '', cnaeDescricao: '', status: 'active', accountId: '' }
  const perfilForm = { type: '', gateway: '', status: 'active', cnpjId: '', accountId: '' }

  const [formEmail, setFormEmail] = useState(emailForm)
  const [formCnpj, setFormCnpj] = useState(cnpjForm)
  const [formPerfil, setFormPerfil] = useState(perfilForm)
  const [submitting, setSubmitting] = useState(false)
  const [consultandoCnpj, setConsultandoCnpj] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadSupplierId, setUploadSupplierId] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported: number; duplicates: number; failed: number } | null>(null)
  const [filterSupplier, setFilterSupplier] = useState('')

  async function consultarCnpj() {
    const cnpjLimpo = formCnpj.cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      alert('Informe um CNPJ válido (14 dígitos) para consultar.')
      return
    }
    setConsultandoCnpj(true)
    try {
      const res = await fetch(`/api/receita/consulta-cnpj?cnpj=${cnpjLimpo}`)
      const data = await res.json()
      if (res.ok) {
        setFormCnpj((f) => ({
          ...f,
          cnpj: data.cnpj,
          razaoSocial: data.razaoSocial || f.razaoSocial,
          nomeFantasia: data.nomeFantasia || f.nomeFantasia,
          cnae: data.cnae || f.cnae,
          cnaeDescricao: data.cnaeDescricao || f.cnaeDescricao,
        }))
      } else {
        alert(data.error || 'CNPJ não encontrado.')
      }
    } catch {
      alert('Erro ao consultar. Tente novamente.')
    } finally {
      setConsultandoCnpj(false)
    }
  }

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    if (filterSupplier) params.set('supplierId', filterSupplier)
    const [eRes, cRes, pRes] = await Promise.all([
      fetch(`/api/base/emails?${params}`),
      fetch(`/api/base/cnpjs?${filterStatus ? `status=${filterStatus}` : ''}`),
      fetch(`/api/base/perfis${filterStatus ? `?status=${filterStatus}` : ''}`),
    ])
    const eData = await eRes.json()
    const cData = await cRes.json()
    const pData = await pRes.json()
    if (eRes.ok) {
      setEmails(eData.emails || [])
      setSuppliers(eData.suppliers || [])
    }
    if (cRes.ok) setCnpjs(cData)
    if (pRes.ok) setPerfis(pData)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [tab, filterStatus, filterSupplier])

  async function handleUpload() {
    if (!uploadFile || !uploadSupplierId) {
      alert('Selecione o arquivo CSV e o fornecedor.')
      return
    }
    setUploading(true)
    setUploadResult(null)
    const fd = new FormData()
    fd.append('file', uploadFile)
    fd.append('supplierId', uploadSupplierId)
    try {
      const res = await fetch('/api/base/emails/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        setUploadResult({ imported: data.imported, duplicates: data.duplicates, failed: data.failed })
        setUploadFile(null)
        setUploadSupplierId('')
        load()
      } else {
        alert(data.error || 'Erro no upload.')
      }
    } catch {
      alert('Erro ao enviar. Tente novamente.')
    } finally {
      setUploading(false)
    }
  }

  function downloadTemplate() {
    const csv = 'email;senha;recuperacao\nconta1@gmail.com;senha123;recuperacao@email.com\nconta2@gmail.com;senha456;'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'template-emails.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function handleCreateEmail(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/base/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
        email: formEmail.email,
        recovery: formEmail.recovery || undefined,
        passwordPlain: formEmail.password || undefined,
        accountId: formEmail.accountId || undefined,
        supplierId: formEmail.supplierId || undefined,
        status: 'AVAILABLE',
      }),
    })
    if (res.ok) {
      setFormEmail(emailForm)
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao cadastrar')
    }
    setSubmitting(false)
  }

  async function handleCreateCnpj(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/base/cnpjs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnpj: formCnpj.cnpj,
        razaoSocial: formCnpj.razaoSocial || undefined,
        nomeFantasia: formCnpj.nomeFantasia || undefined,
        cnae: formCnpj.cnae || undefined,
        cnaeDescricao: formCnpj.cnaeDescricao || undefined,
        accountId: formCnpj.accountId || undefined,
        status: 'AVAILABLE',
      }),
    })
    if (res.ok) {
      setFormCnpj(cnpjForm)
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao cadastrar')
    }
    setSubmitting(false)
  }

  async function handleCreatePerfil(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/base/perfis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formPerfil,
        cnpjId: formPerfil.cnpjId || undefined,
        accountId: formPerfil.accountId || undefined,
      }),
    })
    if (res.ok) {
      setFormPerfil(perfilForm)
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro ao cadastrar')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <h1 className="heading-1 mb-6">
        Base de E-mails / CNPJs / Perfis
      </h1>

      <div className="flex gap-2 mb-4">
        {(['emails', 'cnpjs', 'perfis'] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setShowForm(false) }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              tab === t ? 'bg-primary-500 text-white' : 'bg-gray-200 text-[#1F2937] hover:bg-gray-300'
            }`}
          >
            {t === 'emails' ? 'E-mails Gmail' : t === 'cnpjs' ? 'CNPJs Nutra' : 'Perfis de Pagamento'}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          <div className="flex gap-2 items-center flex-wrap">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field py-1.5 px-2 w-32 text-sm"
            >
              <option value="">Status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            {tab === 'emails' && (
              <select
                value={filterSupplier}
                onChange={(e) => setFilterSupplier(e.target.value)}
                className="input-field py-1.5 px-2 w-40 text-sm"
              >
                <option value="">Todos fornecedores</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            {tab === 'emails' && (
              <button
                type="button"
                onClick={() => { setShowUpload(!showUpload); setShowForm(false); setUploadResult(null) }}
                className={showUpload ? 'btn-secondary' : 'btn-primary'}
              >
                {showUpload ? 'Cancelar' : 'Upload em lote'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowForm(!showForm); setShowUpload(false) }}
              className="btn-primary"
            >
              {showForm ? 'Cancelar' : 'Adicionar'}
            </button>
          </div>
        </div>

        {showUpload && tab === 'emails' && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-primary-600/5 space-y-3">
            <h3 className="font-medium text-[#1F2937]">Upload de e-mails (fornecedores)</h3>
            <p className="text-sm text-gray-600">
              Faça upload do CSV com e-mails comprados. Formato: <code className="bg-gray-200 px-1 rounded">email;senha;recuperação</code>
            </p>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Fornecedor *</label>
                <select
                  value={uploadSupplierId}
                  onChange={(e) => setUploadSupplierId(e.target.value)}
                  className="input-field py-2 w-48"
                >
                  <option value="">Selecione</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Arquivo CSV *</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadSupplierId}
                className="btn-primary"
              >
                {uploading ? 'Enviando...' : 'Enviar'}
              </button>
              <button type="button" onClick={downloadTemplate} className="btn-secondary text-sm">
                Baixar template
              </button>
            </div>
            {uploadResult && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
                <strong>Upload concluído:</strong> {uploadResult.imported} importados, {uploadResult.duplicates} duplicados ignorados, {uploadResult.failed} falhas.
              </div>
            )}
          </div>
        )}

        {showForm && tab === 'emails' && (
          <form onSubmit={handleCreateEmail} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Fornecedor</label>
                <select
                  value={formEmail.supplierId}
                  onChange={(e) => setFormEmail((f) => ({ ...f, supplierId: e.target.value }))}
                  className="input-field"
                >
                  <option value="">— Manual —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail *</label>
                <input
                  type="email"
                  value={formEmail.email}
                  onChange={(e) => setFormEmail((f) => ({ ...f, email: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Senha</label>
                <input
                  type="password"
                  value={formEmail.password}
                  onChange={(e) => setFormEmail((f) => ({ ...f, password: e.target.value }))}
                  className="input-field"
                  placeholder="Para o colaborador usar na produção"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">E-mail de recuperação</label>
                <input
                  type="text"
                  value={formEmail.recovery}
                  onChange={(e) => setFormEmail((f) => ({ ...f, recovery: e.target.value }))}
                  className="input-field"
                  placeholder="E-mail alternativo para recuperação"
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">Salvar</button>
          </form>
        )}

        {showForm && tab === 'cnpjs' && (
          <form onSubmit={handleCreateCnpj} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1">CNPJ *</label>
                  <input
                    type="text"
                    value={formCnpj.cnpj}
                    onChange={(e) => setFormCnpj((f) => ({ ...f, cnpj: e.target.value }))}
                    className="input-field"
                    placeholder="00.000.000/0001-00"
                    required
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={consultarCnpj}
                    disabled={consultandoCnpj || formCnpj.cnpj.replace(/\D/g, '').length !== 14}
                    className="btn-secondary whitespace-nowrap py-2.5"
                  >
                    {consultandoCnpj ? 'Consultando...' : 'Consultar Receita'}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Razão Social</label>
                <input
                  type="text"
                  value={formCnpj.razaoSocial}
                  onChange={(e) => setFormCnpj((f) => ({ ...f, razaoSocial: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={formCnpj.nomeFantasia}
                  onChange={(e) => setFormCnpj((f) => ({ ...f, nomeFantasia: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CNAE</label>
                <input
                  type="text"
                  value={formCnpj.cnae}
                  onChange={(e) => setFormCnpj((f) => ({ ...f, cnae: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descrição CNAE</label>
                <input
                  type="text"
                  value={formCnpj.cnaeDescricao}
                  onChange={(e) => setFormCnpj((f) => ({ ...f, cnaeDescricao: e.target.value }))}
                  className="input-field"
                  placeholder="Atividade econômica"
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">Salvar</button>
          </form>
        )}

        {showForm && tab === 'perfis' && (
          <form onSubmit={handleCreatePerfil} className="mb-6 p-4 bg-gray-50 rounded-lg space-y-3 border border-primary-600/5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo *</label>
                <input
                  type="text"
                  value={formPerfil.type}
                  onChange={(e) => setFormPerfil((f) => ({ ...f, type: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: PIX"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gateway *</label>
                <input
                  type="text"
                  value={formPerfil.gateway}
                  onChange={(e) => setFormPerfil((f) => ({ ...f, gateway: e.target.value }))}
                  className="input-field"
                  placeholder="Ex: Banco Inter"
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">Salvar</button>
          </form>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          ) : tab === 'emails' ? (
            emails.length === 0 ? (
              <p className="text-gray-400 py-4">Nenhum e-mail cadastrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">E-mail</th>
                    <th className="pb-2 pr-4">Fornecedor</th>
                    <th className="pb-2 pr-4">Recuperação</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Usado por / Conta</th>
                    <th className="pb-2">Conta vinculada</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => (
                    <tr key={e.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">{e.email}</td>
                      <td className="py-3 pr-4">{e.supplier?.name || (e.batch ? 'Lote' : 'Manual')}</td>
                      <td className="py-3 pr-4">{e.recovery || '—'}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          e.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                          e.status === 'RESERVED' ? 'bg-amber-100 text-amber-800' :
                          e.status === 'CONSUMED' ? 'bg-gray-100 text-gray-700' : 'bg-gray-100'
                        }`}>
                          {e.status === 'AVAILABLE' ? 'Disponível' : e.status === 'RESERVED' ? 'Reservado' : 'Usado'}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {e.status === 'CONSUMED' && e.productionAccount ? (
                          <span title={`Conta #${e.productionAccount.id}`}>
                            {e.productionAccount.producer?.name || e.productionAccount.producer?.email || '—'} → #{e.productionAccount.id.slice(0, 8)}
                          </span>
                        ) : e.status === 'RESERVED' ? (
                          <span className="text-amber-600">Em reserva</span>
                        ) : '—'}
                      </td>
                      <td className="py-3">{e.account ? `${e.account.platform} / ${e.account.type}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === 'cnpjs' ? (
            cnpjs.length === 0 ? (
              <p className="text-gray-400 py-4">Nenhum CNPJ cadastrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">CNPJ</th>
                    <th className="pb-2 pr-4">Razão Social</th>
                    <th className="pb-2 pr-4">CNAE</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Conta vinculada</th>
                  </tr>
                </thead>
                <tbody>
                  {cnpjs.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">{c.cnpj}</td>
                      <td className="py-3 pr-4">{c.razaoSocial || '—'}</td>
                      <td className="py-3 pr-4">{c.cnae || '—'}</td>
                      <td className="py-3 pr-4">{c.status}</td>
                      <td className="py-3">{c.account ? `${c.account.platform} / ${c.account.type}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            perfis.length === 0 ? (
              <p className="text-gray-400 py-4">Nenhum perfil de pagamento cadastrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Gateway</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">CNPJ / Conta</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 pr-4">{p.type}</td>
                      <td className="py-3 pr-4">{p.gateway}</td>
                      <td className="py-3 pr-4">{p.status}</td>
                      <td className="py-3">{p.cnpj?.cnpj || p.account?.platform || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>
      </div>
    </div>
  )
}
