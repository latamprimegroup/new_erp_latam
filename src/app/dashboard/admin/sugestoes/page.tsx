'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Pencil, Trash2 } from 'lucide-react'
import { FlashBanner } from '@/components/FlashBanner'

type Suggestion = {
  id: string
  category: string
  title: string
  description: string
  createdAt: string
  user: { name: string | null; email: string } | null
}

const CONFIRM_DELETE =
  'Tem certeza que deseja excluir esta sugestão? Esta ação não pode ser desfeita.'

export default function SugestoesPage() {
  const { data: session } = useSession()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'SYSTEM' | 'COMPANY'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = filter !== 'all' ? `?category=${filter}` : ''
    const r = await fetch(`/api/suggestions${params}`)
    const d = await r.json()
    if (Array.isArray(d)) setSuggestions(d)
    setLoading(false)
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  function startEdit(s: Suggestion) {
    setEditingId(s.id)
    setEditTitle(s.title)
    setEditDescription(s.description)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setSaving(true)
    const res = await fetch(`/api/suggestions/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, description: editDescription }),
    })
    if (res.ok) {
      setEditingId(null)
      setFlash({ type: 'success', text: 'Sugestão atualizada.' })
      load()
    } else {
      const err = await res.json()
      setFlash({ type: 'error', text: err.error || 'Erro ao salvar' })
    }
    setSaving(false)
  }

  async function remove(id: string) {
    if (!confirm(CONFIRM_DELETE)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/suggestions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setEditingId(null)
        setFlash({ type: 'success', text: 'Sugestão excluída.' })
        load()
      } else {
        const err = await res.json()
        setFlash({ type: 'error', text: err.error || 'Erro ao excluir' })
      }
    } finally {
      setDeletingId(null)
    }
  }

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="p-6">
        <p className="text-red-500">Acesso restrito a administradores.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="heading-1 mb-4">Sugestões de Melhoria</h1>
      <FlashBanner
        message={flash?.text ?? null}
        type={flash?.type ?? 'info'}
        onDismiss={() => setFlash(null)}
      />
      <div className="flex gap-2 mb-4 mt-2">
        {(['all', 'SYSTEM', 'COMPANY'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10'
            }`}
          >
            {f === 'all' ? 'Todas' : f === 'SYSTEM' ? 'Sistema' : 'Empresa'}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="text-gray-500">Carregando...</p>
      ) : suggestions.length === 0 ? (
        <p className="text-gray-500">Nenhuma sugestão ainda.</p>
      ) : (
        <div className="space-y-4">
          {suggestions.map((s) => (
            <div key={s.id} className="card p-4">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      s.category === 'SYSTEM'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                  >
                    {s.category === 'SYSTEM' ? 'Sistema' : 'Empresa'}
                  </span>
                  {editingId === s.id ? (
                    <form onSubmit={saveEdit} className="mt-3 space-y-3">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="input-field w-full font-semibold"
                        required
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="input-field w-full min-h-[100px]"
                        required
                      />
                      <div className="flex gap-2">
                        <button type="submit" disabled={saving} className="btn-primary text-sm">
                          {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="btn-secondary text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <h3 className="font-semibold mt-2">{s.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                        {s.description}
                      </p>
                    </>
                  )}
                </div>
                {editingId !== s.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="p-2 rounded text-primary-600 hover:bg-primary-500/10"
                      title="Editar"
                      aria-label="Editar"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      disabled={deletingId !== null}
                      className="p-2 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                      title="Excluir"
                      aria-label="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {s.user ? `${s.user.name || s.user.email}` : 'Anônimo'} ·{' '}
                {new Date(s.createdAt).toLocaleString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
