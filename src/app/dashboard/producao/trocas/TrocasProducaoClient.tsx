'use client'

import { RMATab } from '@/app/dashboard/compras/RMATab'

export function TrocasProducaoClient({ userRole }: { userRole: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-black tracking-tight">🛡️ Trocas & Reposição</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Abra um ticket quando uma conta falhar após entrega — a reposição sai do estoque automaticamente
          </p>
        </div>
      </div>
      <RMATab userRole={userRole} />
    </div>
  )
}
