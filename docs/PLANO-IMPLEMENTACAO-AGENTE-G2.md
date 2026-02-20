# Plano de Implementação — Agente G2 Enterprise

## Resumo Executivo

Implementação em **3 fases** com entregas incrementais. Cada fase entrega valor operacional independente.

---

## Fase 1 — Fundação (4–6 semanas)

### 1.1 Schema e Banco
- [ ] Model `DocumentAsset` (RG frente/verso, cartão CNPJ, comprovantes)
- [ ] Model `UniqueAssetRegistry` (hash por tipo: CPF, CNPJ, RG, etc.)
- [ ] Model `ProductionAlert`
- [ ] Índices e constraints

### 1.2 Upload de Documentos
- [ ] API `POST /api/production-g2/[id]/documents` (upload multipart)
- [ ] Cálculo de hash SHA-256
- [ ] Validação de tipo/tamanho
- [ ] Armazenamento (S3 ou filesystem)
- [ ] Registro em DocumentAsset com userId, ip, timestamp

### 1.3 Controle de Reutilização
- [ ] Lib `src/lib/unique-asset.ts`: registrar e verificar hash
- [ ] Integração no fluxo de criação G2: validar antes de consumir Email/Cnpj/Perfil
- [ ] Bloqueio em `consumeForProductionG2` se hash já consumido
- [ ] Tabela UniqueAssetRegistry populada ao consumir

### 1.4 Checklist e Bloqueio de Aprovação
- [ ] Expandir checklist: DOC_RG_FRENTE, DOC_RG_VERSO, DOC_CARTAO_CNPJ
- [ ] API `GET /api/production-g2/[id]/approval-readiness` — retorna se pode aprovar
- [ ] Bloquear `approve` se documentos obrigatórios faltando
- [ ] UI: exibir documentos obrigatórios e status

### 1.5 Auditoria
- [ ] Novas actions em AuditLog: document_uploaded, blocked_duplicate, blocked_reuse, approval_blocked
- [ ] Garantir ip em todas as ações críticas

---

## Fase 2 — Inteligência Operacional (4–6 semanas)

### 2.1 Motor de Meta
- [ ] API `GET /api/production-g2/agent/meta` — meta, produção atual, projeção, ritmo necessário
- [ ] Cálculo: dias restantes, produção diária necessária
- [ ] Indicador de risco (meta em risco sim/não)

### 2.2 Score de Qualidade
- [ ] Função `calculateQualityScore(productionG2Id)` — 0–100
- [ ] Critérios: docs OK, checklist OK, sem conflitos, dados coerentes
- [ ] Campo ou tabela para armazenar score
- [ ] Bloquear aprovação se score < 80

### 2.3 Métricas de Tempo
- [ ] Registrar `startedAt` e `completedAt` por etapa (ProductionG2Log expandido ou nova tabela)
- [ ] Calcular tempo médio por conta, por etapa
- [ ] API `GET /api/production-g2/agent/performance` — tempo médio, comparativo

### 2.4 Sistema de Alertas
- [ ] API `POST /api/production-g2/agent/alerts` — criar alerta
- [ ] API `GET /api/production-g2/agent/alerts` — listar (filtros: produtor, tipo, resolvido)
- [ ] Gatilhos: documento duplicado, meta em risco, qualidade baixa
- [ ] UI: painel de alertas no dashboard

### 2.5 Dashboard do Agente
- [ ] Rota `/dashboard/producao-g2/agente`
- [ ] KPIs: produção, meta, projeção, score, alertas, ranking
- [ ] Ranking interno por produtor (produção mensal, qualidade)
- [ ] Lista de contas pendentes e bloqueadas

---

## Fase 3 — Evolução e Escala (4–6 semanas)

### 3.1 Índice de Risco
- [ ] Cálculo: nicho repetido, domínio repetido, taxa reprovação, histórico docs
- [ ] API `GET /api/production-g2/agent/risk-index`
- [ ] Exibir no dashboard
- [ ] Alerta quando índice > 70

### 3.2 Inteligência Evolutiva
- [ ] Armazenar padrões de erro por produtor
- [ ] Sugestões baseadas em histórico
- [ ] Detecção de aceleração com risco (tempo muito baixo + erro recente)

### 3.3 Holding / Multi-equipe (opcional)
- [ ] Model Team/Equipe
- [ ] Produtores vinculados a equipes
- [ ] Dashboard por equipe
- [ ] Supervisor por equipe

### 3.4 Agente Supervisor Global (opcional)
- [ ] Dashboard executivo consolidado
- [ ] Alertas agregados
- [ ] Comparativo entre equipes

---

## Priorização Recomendada

| Ordem | Item | Impacto | Esforço |
|-------|------|---------|---------|
| 1 | UniqueAssetRegistry + bloqueio reutilização | Alto | Médio |
| 2 | DocumentAsset + upload RG/CNPJ | Alto | Médio |
| 3 | Bloqueio aprovação sem docs | Alto | Baixo |
| 4 | Motor de meta + UI | Alto | Baixo |
| 5 | Sistema de alertas | Médio | Médio |
| 6 | Score de qualidade | Médio | Médio |
| 7 | Dashboard do agente | Médio | Médio |
| 8 | Índice de risco | Médio | Alto |

---

## Dependências Externas

- **Storage:** S3 ou volume persistente para uploads (RG, CNPJ)
- **CRON:** para alertas agendados (meta em risco diário)
- **Redis (opcional):** cache de scores e ranking
