'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type SalesData = {
  accountId: string
  product: string
  value: number
  createdAt: string
}

export default function GestorRelatoriosPage() {
  const [sales, setSales] = useState<SalesData[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/gestor/contas')
      .then((r) => r.json())
      .then((accounts) => {
        const sold = accounts.filter((a: { status: string }) => a.status === 'DELIVERED' || a.status === 'IN_USE')
        setSales(sold)
        setTotal(sold.reduce((acc: number, a: { salePrice?: { toString: () => string } }) => acc + Number(a.salePrice || 0), 0))
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/gestor" className="text-gray-500 hover:text-gray-700">
          ← Voltar
        </Link>
        <h1 className="heading-1">
          Relatórios de Vendas
        </h1>
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Resumo</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Contas vendidas</p>
            <p className="text-2xl font-bold">{sales.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Receita total</p>
            <p className="text-2xl font-bold text-green-600">R$ {total.toLocaleString('pt-BR')}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-4">Histórico de vendas</h2>
        {loading ? (
          <p className="text-gray-500 py-8">Carregando...</p>
        ) : sales.length === 0 ? (
          <p className="text-gray-400 py-8">Nenhuma venda registrada.</p>
        ) : (
          <p className="text-gray-500 text-sm">
            As vendas aparecem quando uma conta vinculada a você for entregue. Consulte o painel Admin para mais detalhes.
          </p>
        )}
      </div>
    </div>
  )
}
