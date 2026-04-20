import { UniManagementClient } from './UniManagementClient'

export default function UniManagementPage() {
  return (
    <div className="space-y-4 text-zinc-100">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Gestão de UNIs</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Módulo 11 — isolamento de identidade: proxy, domínio, cabeçalhos sugeridos, mapa de dependências, log de
          atividade, probe TCP e kill-switch. A partilha do mesmo domínio de landing entre UNIs é bloqueada nas
          campanhas.
        </p>
      </div>
      <UniManagementClient />
    </div>
  )
}
