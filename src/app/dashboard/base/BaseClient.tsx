'use client'

import { useState, useEffect } from 'react'
import { Building2, CreditCard, Mail, Pencil, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/Skeleton'
import { FlashBanner } from '@/components/FlashBanner'

const CONFIRM_DELETE = 'Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.'

type Tab = 'emails' | 'cnpjs' | 'perfis'

type Email = {
  id: string
  email: string
  recovery: string | null
  status: string
  assignedToProducerId?: string | null
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
  nomeFantasia: string | null
  cnae: string | null
  cnaeDescricao: string | null
  status: string
  account: { platform: string; type: string } | null
}

type Perfil = {
  id: string
  type: string
  gateway: string
  status: string
  cnpj: { id: string; cnpj: string; razaoSocial: string | null } | null
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

  type EditPanel = { t: 'email'; id: string } | { t: 'cnpj'; id: string } | { t: 'perfil'; id: string } | null
  const [panel, setPanel] = useState<EditPanel>(null)
  const [editEmail, setEditEmail] = useState({
    email: '',
    recovery: '',
    password: '',
    status: 'AVAILABLE' as 'AVAILABLE' | 'DISABLED',
    supplierId: '',
  })
  const [editCnpj, setEditCnpj] = useState({
    cnpj: '',
    razaoSocial: '',
    nomeFantasia: '',
    cnae: '',
    cnaeDescricao: '' as string,
    status: 'AVAILABLE' as 'AVAILABLE' | 'DISABLED',
  })
  const [editPerfil, setEditPerfil] = useState({
    type: '',
    gateway: '',
    status: 'AVAILABLE' as 'AVAILABLE' | 'DISABLED',
    cnpjId: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  async function consultarCnpj() {
    const cnpjLimpo = formCnpj.cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      setFlash({ type: 'error', text: 'Informe um CNPJ válido (14 dígitos) para consultar.' })
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
        setFlash({ type: 'error', text: data.error || 'CNPJ não encontrado.' })
      }
    } catch {
      setFlash({ type: 'error', text: 'Erro ao consultar. Tente novamente.' })
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
      setFlash({ type: 'error', text: 'Selecione o arquivo CSV e o fornecedor.' })
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
        setFlash({ type: 'success', text: 'Upload concluído com sucesso.' })
        load()
      } else {
        setFlash({ type: 'error', text: data.error || 'Erro no upload.' })
      }
    } catch {
      setFlash({ type: 'error', text: 'Erro ao enviar. Tente novamente.' })
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
      setFlash({ type: 'success', text: 'E-mail cadastrado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao cadastrar' })
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
      setFlash({ type: 'success', text: 'CNPJ cadastrado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao cadastrar' })
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
      setFlash({ type: 'success', text: 'Perfil cadastrado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao cadastrar' })
    }
    setSubmitting(false)
  }

  function openEditEmail(row: Email) {
    setShowForm(false)
    setShowUpload(false)
    setPanel({ t: 'email', id: row.id })
    setEditEmail({
      email: row.email,
      recovery: row.recovery || '',
      password: '',
      status: row.status === 'DISABLED' ? 'DISABLED' : 'AVAILABLE',
      supplierId: row.supplier?.id || '',
    })
  }

  function openEditCnpj(row: Cnpj) {
    setShowForm(false)
    setPanel({ t: 'cnpj', id: row.id })
    setEditCnpj({
      cnpj: row.cnpj,
      razaoSocial: row.razaoSocial || '',
      nomeFantasia: row.nomeFantasia || '',
      cnae: row.cnae || '',
      cnaeDescricao: row.cnaeDescricao || '',
      status: row.status === 'DISABLED' ? 'DISABLED' : 'AVAILABLE',
    })
  }

  function openEditPerfil(row: Perfil) {
    setShowForm(false)
    setPanel({ t: 'perfil', id: row.id })
    setEditPerfil({
      type: row.type,
      gateway: row.gateway,
      status: row.status === 'DISABLED' ? 'DISABLED' : 'AVAILABLE',
      cnpjId: row.cnpj?.id || '',
    })
  }

  async function saveEditEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!panel || panel.t !== 'email') return
    setSavingEdit(true)
    const res = await fetch(`/api/base/emails/${panel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: editEmail.email,
        recovery: editEmail.recovery || null,
        status: editEmail.status,
        supplierId: editEmail.supplierId || null,
        ...(editEmail.password.trim() ? { passwordPlain: editEmail.password } : {}),
      }),
    })
    if (res.ok) {
      setPanel(null)
      setFlash({ type: 'success', text: 'E-mail atualizado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao salvar' })
    }
    setSavingEdit(false)
  }

  async function saveEditCnpj(e: React.FormEvent) {
    e.preventDefault()
    if (!panel || panel.t !== 'cnpj') return
    setSavingEdit(true)
    const res = await fetch(`/api/base/cnpjs/${panel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cnpj: editCnpj.cnpj,
        razaoSocial: editCnpj.razaoSocial || null,
        nomeFantasia: editCnpj.nomeFantasia || null,
        cnae: editCnpj.cnae || null,
        cnaeDescricao: editCnpj.cnaeDescricao || null,
        status: editCnpj.status,
      }),
    })
    if (res.ok) {
      setPanel(null)
      setFlash({ type: 'success', text: 'CNPJ atualizado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao salvar' })
    }
    setSavingEdit(false)
  }

  async function saveEditPerfil(e: React.FormEvent) {
    e.preventDefault()
    if (!panel || panel.t !== 'perfil') return
    setSavingEdit(true)
    const res = await fetch(`/api/base/perfis/${panel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: editPerfil.type,
        gateway: editPerfil.gateway,
        status: editPerfil.status,
        cnpjId: editPerfil.cnpjId || null,
      }),
    })
    if (res.ok) {
      setPanel(null)
      setFlash({ type: 'success', text: 'Perfil atualizado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao salvar' })
    }
    setSavingEdit(false)
  }

  async function deleteEmail(id: string) {
    if (!confirm(CONFIRM_DELETE)) return
    setPendingDelete(`email:${id}`)
    try {
      const res = await fetch(`/api/base/emails/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPanel(null)
        setFlash({ type: 'success', text: 'E-mail excluído.' })
        load()
      } else {
        const err = await res.json()
        setFlash({ type: 'error', text: err.error || 'Erro ao excluir' })
      }
    } finally {
      setPendingDelete(null)
    }
  }

  async function deleteCnpj(id: string) {
    if (!confirm(CONFIRM_DELETE)) return
    setPendingDelete(`cnpj:${id}`)
    try {
      const res = await fetch(`/api/base/cnpjs/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPanel(null)
        setFlash({ type: 'success', text: 'CNPJ excluído.' })
        load()
      } else {
        const err = await res.json()
        setFlash({ type: 'error', text: err.error || 'Erro ao excluir' })
      }
    } finally {
      setPendingDelete(null)
    }
  }

  async function deletePerfil(id: string) {
    if (!confirm(CONFIRM_DELETE)) return
    setPendingDelete(`perfil:${id}`)
    try {
      const res = await fetch(`/api/base/perfis/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPanel(null)
        setFlash({ type: 'success', text: 'Perfil excluído.' })
        load()
      } else {
        const err = await res.json()
        setFlash({ type: 'error', text: err.error || 'Erro ao excluir' })
      }
    } finally {
      setPendingDelete(null)
    }
  }

  return (
    <div>
      <h1 className="heading-1 mb-2">Base de E-mails / CNPJs / Perfis</h1>
      <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6 max-w-3xl">
        Pulmão de dados para produção: contas Gmail, CNPJs e perfis de pagamento usados na criação de contas.
        Filtre por status e fornecedor; use upload em lote (e-mails) ou cadastro manual.
      </p>

      <FlashBanner
        message={flash?.text ?? null}
        type={flash?.type === 'success' ? 'success' : flash?.type === 'error' ? 'error' : 'info'}
        onDismiss={() => setFlash(null)}
      />

      <div
        className="flex flex-wrap gap-1 p-1 mb-4 w-fit max-w-full rounded-xl bg-zinc-200/80 border border-zinc-300/80 dark:bg-zinc-950/90 dark:border-cyan-500/25"
        role="tablist"
        aria-label="Tipo de base"
      >
        {(['emails', 'cnpjs', 'perfis'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t)
              setShowForm(false)
              setPanel(null)
            }}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm sm:text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950 ${
              tab === t
                ? 'bg-primary-500 text-white shadow-md shadow-primary-500/25 dark:shadow-[0_0_22px_rgba(34,211,238,0.18)]'
                : 'text-zinc-800 bg-zinc-50 border border-zinc-200/90 shadow-sm hover:bg-zinc-100 hover:border-zinc-300 dark:text-zinc-100 dark:bg-white/[0.07] dark:border-white/12 dark:shadow-none dark:hover:bg-white/[0.14] dark:hover:border-white/18 dark:hover:text-white'
            }`}
          >
            {t === 'emails' ? (
              <>
                <Mail className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
                E-mails Gmail
              </>
            ) : t === 'cnpjs' ? (
              <>
                <Building2 className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
                CNPJs Nutra
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 shrink-0 opacity-90" aria-hidden />
                Perfis de Pagamento
              </>
            )}
          </button>
        ))}
      </div>

      <div className="card dark:border-cyan-500/20 dark:bg-zinc-950/35 dark:shadow-[0_0_24px_rgba(34,211,238,0.04)]">
        <div className="flex flex-wrap justify-between items-end gap-4 mb-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex flex-col gap-1 min-w-[11rem]">
              <label className="text-xs text-gray-500 dark:text-zinc-400">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input-field py-1.5 px-2 text-sm"
                aria-label="Filtrar por status"
              >
                <option value="">Todos os status</option>
                <option value="active">Disponível (ativo)</option>
                <option value="inactive">Inativo / desabilitado</option>
              </select>
            </div>
            {tab === 'emails' && (
              <div className="flex flex-col gap-1 min-w-[12rem]">
                <label className="text-xs text-gray-500 dark:text-zinc-400">Fornecedor</label>
                <select
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  className="input-field py-1.5 px-2 text-sm"
                  aria-label="Filtrar por fornecedor"
                >
                  <option value="">Todos fornecedores</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
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

        {panel?.t === 'email' && (
          <form
            onSubmit={saveEditEmail}
            className="mb-6 p-4 bg-sky-50 dark:bg-sky-950/20 rounded-lg border border-sky-200/60 dark:border-sky-800/40 space-y-3"
          >
            <h3 className="font-medium text-[#1F2937] dark:text-gray-100">Editar e-mail</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Fornecedor</label>
                <select
                  value={editEmail.supplierId}
                  onChange={(e) => setEditEmail((f) => ({ ...f, supplierId: e.target.value }))}
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
                  value={editEmail.email}
                  onChange={(e) => setEditEmail((f) => ({ ...f, email: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nova senha (opcional)</label>
                <input
                  type="password"
                  value={editEmail.password}
                  onChange={(e) => setEditEmail((f) => ({ ...f, password: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Recuperação</label>
                <input
                  type="text"
                  value={editEmail.recovery}
                  onChange={(e) => setEditEmail((f) => ({ ...f, recovery: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editEmail.status}
                  onChange={(e) =>
                    setEditEmail((f) => ({ ...f, status: e.target.value as 'AVAILABLE' | 'DISABLED' }))
                  }
                  className="input-field"
                >
                  <option value="AVAILABLE">Disponível</option>
                  <option value="DISABLED">Inativo</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingEdit} className="btn-primary">Salvar alterações</button>
              <button type="button" onClick={() => setPanel(null)} className="btn-secondary">Cancelar</button>
            </div>
          </form>
        )}

        {panel?.t === 'cnpj' && (
          <form onSubmit={saveEditCnpj} className="mb-6 p-4 bg-sky-50 dark:bg-sky-950/20 rounded-lg border border-sky-200/60 dark:border-sky-800/40 space-y-3">
            <h3 className="font-medium text-[#1F2937] dark:text-gray-100">Editar CNPJ</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">CNPJ *</label>
                <input
                  type="text"
                  value={editCnpj.cnpj}
                  onChange={(e) => setEditCnpj((f) => ({ ...f, cnpj: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editCnpj.status}
                  onChange={(e) =>
                    setEditCnpj((f) => ({ ...f, status: e.target.value as 'AVAILABLE' | 'DISABLED' }))
                  }
                  className="input-field"
                >
                  <option value="AVAILABLE">Disponível</option>
                  <option value="DISABLED">Inativo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Razão social</label>
                <input
                  type="text"
                  value={editCnpj.razaoSocial}
                  onChange={(e) => setEditCnpj((f) => ({ ...f, razaoSocial: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nome fantasia</label>
                <input
                  type="text"
                  value={editCnpj.nomeFantasia}
                  onChange={(e) => setEditCnpj((f) => ({ ...f, nomeFantasia: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CNAE</label>
                <input
                  type="text"
                  value={editCnpj.cnae}
                  onChange={(e) => setEditCnpj((f) => ({ ...f, cnae: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Descrição CNAE</label>
                <input
                  type="text"
                  value={editCnpj.cnaeDescricao}
                  onChange={(e) => setEditCnpj((f) => ({ ...f, cnaeDescricao: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingEdit} className="btn-primary">Salvar alterações</button>
              <button type="button" onClick={() => setPanel(null)} className="btn-secondary">Cancelar</button>
            </div>
          </form>
        )}

        {panel?.t === 'perfil' && (
          <form onSubmit={saveEditPerfil} className="mb-6 p-4 bg-sky-50 dark:bg-sky-950/20 rounded-lg border border-sky-200/60 dark:border-sky-800/40 space-y-3">
            <h3 className="font-medium text-[#1F2937] dark:text-gray-100">Editar perfil de pagamento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo *</label>
                <input
                  type="text"
                  value={editPerfil.type}
                  onChange={(e) => setEditPerfil((f) => ({ ...f, type: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Gateway *</label>
                <input
                  type="text"
                  value={editPerfil.gateway}
                  onChange={(e) => setEditPerfil((f) => ({ ...f, gateway: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editPerfil.status}
                  onChange={(e) =>
                    setEditPerfil((f) => ({ ...f, status: e.target.value as 'AVAILABLE' | 'DISABLED' }))
                  }
                  className="input-field"
                >
                  <option value="AVAILABLE">Disponível</option>
                  <option value="DISABLED">Inativo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CNPJ vinculado</label>
                <select
                  value={editPerfil.cnpjId}
                  onChange={(e) => setEditPerfil((f) => ({ ...f, cnpjId: e.target.value }))}
                  className="input-field"
                >
                  <option value="">— Nenhum —</option>
                  {cnpjs.map((c) => (
                    <option key={c.id} value={c.id}>{c.cnpj} {c.razaoSocial ? `— ${c.razaoSocial}` : ''}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingEdit} className="btn-primary">Salvar alterações</button>
              <button type="button" onClick={() => setPanel(null)} className="btn-secondary">Cancelar</button>
            </div>
          </form>
        )}

        {showUpload && tab === 'emails' && (
          <div className="mb-6 p-4 bg-gray-50 dark:bg-zinc-900/70 rounded-lg border border-primary-600/5 dark:border-cyan-500/20 space-y-3">
            <h3 className="font-medium text-[#1F2937] dark:text-zinc-100">Upload de e-mails (fornecedores)</h3>
            <p className="text-sm text-gray-600 dark:text-zinc-400">
              Faça upload do CSV com e-mails comprados. Formato:{' '}
              <code className="bg-gray-200 dark:bg-zinc-950 dark:text-cyan-200/90 px-1 rounded border dark:border-white/10">
                email;senha;recuperação
              </code>
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
              <div className="p-3 bg-green-50 dark:bg-emerald-950/30 border border-green-200 dark:border-emerald-700/40 rounded-lg text-sm text-gray-800 dark:text-emerald-100/95">
                <strong>Upload concluído:</strong> {uploadResult.imported} importados, {uploadResult.duplicates}{' '}
                duplicados ignorados, {uploadResult.failed} falhas.
              </div>
            )}
          </div>
        )}

        {showForm && tab === 'emails' && (
          <form
            onSubmit={handleCreateEmail}
            className="mb-6 p-4 bg-gray-50 dark:bg-zinc-900/70 rounded-lg space-y-3 border border-primary-600/5 dark:border-cyan-500/20"
          >
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
          <form
            onSubmit={handleCreateCnpj}
            className="mb-6 p-4 bg-gray-50 dark:bg-zinc-900/70 rounded-lg space-y-3 border border-primary-600/5 dark:border-cyan-500/20"
          >
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
          <form
            onSubmit={handleCreatePerfil}
            className="mb-6 p-4 bg-gray-50 dark:bg-zinc-900/70 rounded-lg space-y-3 border border-primary-600/5 dark:border-cyan-500/20"
          >
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
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-cyan-500/25 bg-zinc-50/50 dark:bg-zinc-950/40 px-4 py-10 text-center">
                <Mail className="w-10 h-10 mx-auto text-zinc-400 dark:text-cyan-500/50 mb-3" aria-hidden />
                <p className="text-gray-600 dark:text-zinc-300 text-sm font-medium">Nenhum e-mail cadastrado.</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 max-w-md mx-auto">
                  Use <strong className="text-zinc-600 dark:text-zinc-300">Upload em lote</strong> (CSV + fornecedor) ou{' '}
                  <strong className="text-zinc-600 dark:text-zinc-300">Adicionar</strong> para incluir contas Gmail manualmente.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUpload(true)
                      setShowForm(false)
                      setUploadResult(null)
                      setPanel(null)
                    }}
                    className="btn-primary text-sm"
                  >
                    Upload em lote
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(true)
                      setShowUpload(false)
                      setPanel(null)
                    }}
                    className="btn-secondary text-sm"
                  >
                    Adicionar e-mail
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-white/10">
                    <th className="pb-2 pr-4">E-mail</th>
                    <th className="pb-2 pr-4">Fornecedor</th>
                    <th className="pb-2 pr-4">Recuperação</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Usado por / Conta</th>
                    <th className="pb-2 pr-4">Conta vinculada</th>
                    <th className="pb-2 w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-gray-100 dark:border-white/5 last:border-0 text-gray-900 dark:text-zinc-200"
                    >
                      <td className="py-3 pr-4">{e.email}</td>
                      <td className="py-3 pr-4">{e.supplier?.name || (e.batch ? 'Lote' : 'Manual')}</td>
                      <td className="py-3 pr-4">{e.recovery || '—'}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${
                            e.status === 'AVAILABLE'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                              : e.status === 'RESERVED'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-200'
                                : e.status === 'CONSUMED'
                                  ? 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-zinc-300'
                                  : 'bg-gray-100 dark:bg-white/10'
                          }`}
                        >
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
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditEmail(e)}
                            className="p-1.5 rounded text-primary-600 hover:bg-primary-500/10"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEmail(e.id)}
                            disabled={pendingDelete === `email:${e.id}`}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Excluir"
                            aria-label="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === 'cnpjs' ? (
            cnpjs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-cyan-500/25 bg-zinc-50/50 dark:bg-zinc-950/40 px-4 py-10 text-center">
                <Building2 className="w-10 h-10 mx-auto text-zinc-400 dark:text-cyan-500/50 mb-3" aria-hidden />
                <p className="text-gray-600 dark:text-zinc-300 text-sm font-medium">Nenhum CNPJ cadastrado.</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 max-w-md mx-auto">
                  Use <strong className="text-zinc-600 dark:text-zinc-300">Adicionar</strong> e o botão de consulta à Receita para preencher razão social e CNAE.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(true)
                      setShowUpload(false)
                      setPanel(null)
                    }}
                    className="btn-primary text-sm"
                  >
                    Adicionar CNPJ
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-white/10">
                    <th className="pb-2 pr-4">CNPJ</th>
                    <th className="pb-2 pr-4">Razão Social</th>
                    <th className="pb-2 pr-4">CNAE</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Conta vinculada</th>
                    <th className="pb-2 w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {cnpjs.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 dark:border-white/5 last:border-0 text-gray-900 dark:text-zinc-200"
                    >
                      <td className="py-3 pr-4">{c.cnpj}</td>
                      <td className="py-3 pr-4">{c.razaoSocial || '—'}</td>
                      <td className="py-3 pr-4">{c.cnae || '—'}</td>
                      <td className="py-3 pr-4">{c.status}</td>
                      <td className="py-3 pr-4">{c.account ? `${c.account.platform} / ${c.account.type}` : '—'}</td>
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditCnpj(c)}
                            className="p-1.5 rounded text-primary-600 hover:bg-primary-500/10"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteCnpj(c.id)}
                            disabled={pendingDelete === `cnpj:${c.id}`}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Excluir"
                            aria-label="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            perfis.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-cyan-500/25 bg-zinc-50/50 dark:bg-zinc-950/40 px-4 py-10 text-center">
                <CreditCard className="w-10 h-10 mx-auto text-zinc-400 dark:text-cyan-500/50 mb-3" aria-hidden />
                <p className="text-gray-600 dark:text-zinc-300 text-sm font-medium">Nenhum perfil de pagamento cadastrado.</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 max-w-md mx-auto">
                  Use <strong className="text-zinc-600 dark:text-zinc-300">Adicionar</strong> para vincular tipo, gateway e CNPJ quando aplicável.
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(true)
                      setShowUpload(false)
                      setPanel(null)
                    }}
                    className="btn-primary text-sm"
                  >
                    Adicionar perfil
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-zinc-400 border-b border-gray-200 dark:border-white/10">
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Gateway</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">CNPJ / Conta</th>
                    <th className="pb-2 w-24">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-100 dark:border-white/5 last:border-0 text-gray-900 dark:text-zinc-200"
                    >
                      <td className="py-3 pr-4">{p.type}</td>
                      <td className="py-3 pr-4">{p.gateway}</td>
                      <td className="py-3 pr-4">{p.status}</td>
                      <td className="py-3 pr-4">{p.cnpj?.cnpj || p.account?.platform || '—'}</td>
                      <td className="py-3 pr-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditPerfil(p)}
                            className="p-1.5 rounded text-primary-600 hover:bg-primary-500/10"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deletePerfil(p.id)}
                            disabled={pendingDelete === `perfil:${p.id}`}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            title="Excluir"
                            aria-label="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
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
