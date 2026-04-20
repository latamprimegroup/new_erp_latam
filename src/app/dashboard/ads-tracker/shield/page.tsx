import { TrafficShieldClient } from './TrafficShieldClient'

export default function TrafficShieldPage() {
  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Traffic Shield — política de borda</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 03 — monitorização de pedidos, listas de bloqueio e envio de configuração ao servidor de borda (Gerson /
          hospedagem). O ERP não decide conteúdo por visitante; regista o que o edge reporta.
        </p>
      </div>
      <TrafficShieldClient />
    </div>
  )
}
