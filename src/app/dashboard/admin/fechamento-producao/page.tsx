'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Producer = { id: string; name: string | null; email: string }

export default function FechamentoProducaoPage() {
  const [producers, setProducers] = useState<Producer[]>([])
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [closing, setClosing] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/producers')
      .then((r) => r.json())
      .then((d) => setProducers(d.users || []))
  }, [])

  async function handleFechar(userId: string) {
    setClosing(userId)
    try {
      const res = await fetch('/api/admin/producao/fechar-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, month, year }),
      })
      const d = await res.json()
      if (res.ok) alert(`Mês fechado. Total: R$ ${Number(d.totalAmount).toLocaleString('pt-BR')}`)
      else alert(d.error || 'Erro')
    } finally {
      setClosing(null)
    }
  }

  return (
    <div>
      <div className="flex gap-4 items-center mb-6">
        <Link href="/dashboard/admin" className="text-gray-500 hover:text-gray-700">← Admin</Link>
        <h1 className="heading-1">Fechamento Mensal – Produção</h1>
      </div>
      <p className="text-gray-600 text-sm mb-6">
        Feche o mês para cada produtor para liberar o saldo (salário + bônus) para saque.
      </p>

      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Mês</label>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="input-field w-32"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
              <option key={m} value={m}>
                {new Date(2000, m - 1).toLocaleString('pt-BR', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ano</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="input-field w-24"
          />
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Produtores</h2>
        {producers.length === 0 ? (
          <p className="text-gray-500">Nenhum produtor cadastrado.</p>
        ) : (
          <div className="space-y-2">
            {producers.map((p) => (
              <div
                key={p.id}
                className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <span className="font-medium">{p.name || p.email}</span>
                  <span className="text-gray-500 text-sm ml-2">{p.email}</span>
                </div>
                <button
                  onClick={() => handleFechar(p.id)}
                  disabled={!!closing}
                  className="btn-primary text-sm"
                >
                  {closing === p.id ? 'Fechando...' : `Fechar ${month}/${year}`}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
