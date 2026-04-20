'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'
import { FlashBanner } from '@/components/FlashBanner'

type Supplier = {
  id: string
  name: string
  contact: string | null
  taxId: string | null
  pixKey: string | null
  notes: string | null
  _count: { accounts: number; emails: number; emailBatches: number }
}

const CONFIRM_DELETE =
  'Tem certeza que deseja excluir este fornecedor? Esta ação não pode ser desfeita.'

export default function FornecedoresPage() {
  const [list, setList] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', contact: '', taxId: '', pixKey: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/fornecedores')
    const data = await res.json()
    if (res.ok) setList(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function openEdit(s: Supplier) {
    setEditingId(s.id)
    setForm({
      name: s.name,
      contact: s.contact || '',
      taxId: s.taxId || '',
      pixKey: s.pixKey || '',
      notes: s.notes || '',
    })
    setShowForm(true)
  }

  function toggleFormNew() {
    if (showForm) {
      setShowForm(false)
      setEditingId(null)
    } else {
      setEditingId(null)
      setForm({ name: '', contact: '', taxId: '', pixKey: '', notes: '' })
      setShowForm(true)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const wasEditing = editingId
    const url = editingId ? `/api/fornecedores/${editingId}` : '/api/fornecedores'
    const method = editingId ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        contact: form.contact || undefined,
        taxId: form.taxId.trim() || null,
        pixKey: form.pixKey.trim() || null,
        notes: form.notes || undefined,
      }),
    })
    if (res.ok) {
      setForm({ name: '', contact: '', taxId: '', pixKey: '', notes: '' })
      setShowForm(false)
      setEditingId(null)
      setFlash({ type: 'success', text: wasEditing ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao salvar' })
    }
    setSubmitting(false)
  }

  async function handleDelete(id: string) {
    if (!confirm(CONFIRM_DELETE)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/fornecedores/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setShowForm(false)
        setEditingId(null)
        setFlash({ type: 'success', text: 'Fornecedor excluído.' })
        load()
      } else {
        const err = await res.json()
        setFlash({ type: 'error', text: err.error || 'Erro ao excluir' })
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Fornecedores</h1>
        <button type="button" onClick={toggleFormNew} className="btn-primary ml-auto">
          {showForm && !editingId ? 'Fechar' : 'Novo fornecedor'}
        </button>
      </div>
      <div className="mb-6">
        <FlashBanner
          message={flash?.text ?? null}
          type={flash?.type ?? 'info'}
          onDismiss={() => setFlash(null)}
        />
      </div>

      {showForm && (
        <div className="card mb-6">
          <h2 className="font-medium mb-4">{editingId ? 'Editar fornecedor' : 'Novo fornecedor'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contato</label>
                <input
                  type="text"
                  value={form.contact}
                  onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                  className="input-field"
                  placeholder="WhatsApp, e-mail, etc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">CPF / CNPJ</label>
                <input
                  type="text"
                  value={form.taxId}
                  onChange={(e) => setForm((f) => ({ ...f, taxId: e.target.value }))}
                  className="input-field"
                  placeholder="Somente números ou com máscara"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Chave PIX</label>
                <input
                  type="text"
                  value={form.pixKey}
                  onChange={(e) => setForm((f) => ({ ...f, pixKey: e.target.value }))}
                  className="input-field"
                  placeholder="E-mail, telefone, CPF/CNPJ ou aleatória"
                  autoComplete="off"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Observações</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : list.length === 0 ? (
          <p className="text-gray-400 py-8">Nenhum fornecedor cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="pb-2 pr-4">Nome</th>
                <th className="pb-2 pr-4">Contato</th>
                <th className="pb-2 pr-4">CPF/CNPJ</th>
                <th className="pb-2 pr-4">PIX</th>
                <th className="pb-2 pr-4">Contas estoque</th>
                <th className="pb-2 pr-4">E-mails / Lotes</th>
                <th className="pb-2 pr-4">Observações</th>
                <th className="pb-2 w-24">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-4 font-medium">{s.name}</td>
                  <td className="py-3 pr-4">{s.contact || '—'}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{s.taxId || '—'}</td>
                  <td className="py-3 pr-4 max-w-[140px] truncate" title={s.pixKey || undefined}>
                    {s.pixKey ? s.pixKey : '—'}
                  </td>
                  <td className="py-3 pr-4">{s._count.accounts}</td>
                  <td className="py-3 pr-4">{s._count.emails} / {s._count.emailBatches}</td>
                  <td className="py-3 pr-4 max-w-xs truncate">{s.notes || '—'}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="p-1.5 rounded text-primary-600 hover:bg-primary-500/10"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId !== null}
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
        )}
      </div>
    </div>
  )
}
