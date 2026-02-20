'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Supplier = {
  id: string
  name: string
  contact: string | null
  notes: string | null
  _count: { accounts: number }
}

export default function FornecedoresPage() {
  const [list, setList] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', contact: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    const res = await fetch('/api/fornecedores')
    const data = await res.json()
    if (res.ok) setList(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const res = await fetch('/api/fornecedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        contact: form.contact || undefined,
        notes: form.notes || undefined,
      }),
    })
    if (res.ok) {
      setForm({ name: '', contact: '', notes: '' })
      setShowForm(false)
      load()
    } else {
      const err = await res.json()
      alert(err.error || 'Erro')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Fornecedores</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary ml-auto">
          {showForm ? 'Cancelar' : 'Novo fornecedor'}
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
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
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Observações</label>
                <input
                  type="text"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary">Salvar</button>
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
                <th className="pb-2 pr-4">Contas</th>
                <th className="pb-2">Observações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-3 pr-4 font-medium">{s.name}</td>
                  <td className="py-3 pr-4">{s.contact || '—'}</td>
                  <td className="py-3 pr-4">{s._count.accounts}</td>
                  <td className="py-3">{s.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
