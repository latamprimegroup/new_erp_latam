'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

type Suggestion = {
  id: string
  category: string
  title: string
  description: string
  createdAt: string
  user: { name: string | null; email: string } | null
}

export default function SugestoesPage() {
  const { data: session } = useSession()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'SYSTEM' | 'COMPANY'>('all')

  useEffect(() => {
    const params = filter !== 'all' ? `?category=${filter}` : ''
    fetch(`/api/suggestions${params}`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setSuggestions(d) : []))
      .finally(() => setLoading(false))
  }, [filter])

  if (session?.user?.role !== 'ADMIN') {
    return (
      <div className="p-6">
        <p className="text-red-500">Acesso restrito a administradores.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="heading-1 mb-6">Sugestões de Melhoria</h1>
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'all' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10'
          }`}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setFilter('SYSTEM')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'SYSTEM' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10'
          }`}
        >
          Sistema
        </button>
        <button
          type="button"
          onClick={() => setFilter('COMPANY')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            filter === 'COMPANY' ? 'bg-primary-500 text-white' : 'bg-gray-200 dark:bg-white/10'
          }`}
        >
          Empresa
        </button>
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
                <div>
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      s.category === 'SYSTEM' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                  >
                    {s.category === 'SYSTEM' ? 'Sistema' : 'Empresa'}
                  </span>
                  <h3 className="font-semibold mt-2">{s.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                    {s.description}
                  </p>
                </div>
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
