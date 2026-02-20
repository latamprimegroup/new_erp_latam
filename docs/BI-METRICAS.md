# BI e Métricas Estratégicas

## Visão Geral

Sistema de métricas, LTV, CAC, Churn, segmentação, valuation e radar de risco.

## Modelos

- **CustomerMetrics** – métricas por cliente (LTV, segmento, churn risk)
- **CohortMetric** – análise por coorte (mês de aquisição)
- **ValuationSnapshot** – valuation mensal (conservador, moderado, agressivo)
- **RiskRadarSnapshot** – score de saúde empresarial (0-100)
- **ProductionMetricsSnapshot** – métricas de produção agregadas

## Segmentos de Cliente

| Segmento | Critério |
|----------|----------|
| VIP | Receita alta, comprou recentemente |
| ESTRATEGICO | Receita 2x ticket médio |
| OPORTUNIDADE | Ativo, ticket próximo da média |
| RISCO | Sem compra 45+ dias |
| INATIVO | Sem compra 90+ dias |

## Cron Diário

Configure no agendador (Vercel Cron, etc.):

```
GET /api/cron/bi-metrics?secret=CRON_SECRET
```

Recalcula: CustomerMetrics, RiskRadar, Valuation, ProductionMetrics, CohortMetrics.

## Centro de Comando CEO

`/dashboard/admin/ceo` – visão executiva:
- Receita atual e mês
- LTV médio
- Churn alto risco
- Receita em risco
- Índice de saúde (0-100)
- Valuation (conservador, moderado, agressivo)

Clique em **Calcular métricas** para popular dados (antes do primeiro cron).

## Simulador de Expansão

`/dashboard/admin/simuladores` – simule impacto de novo país:
- CAC, margem, churn, investimento
- Receita projetada 12m, ROI, break-even, impacto valuation

## Metas Dinâmicas

`GET /api/admin/metas-dinamicas` – sugere metas baseado em histórico + 5%.

## Dashboards por Setor

`GET /api/admin/dashboards-inteligentes?setor=producao|estoque|vendas|entregas` – KPIs por setor.

## Migração

```bash
npx prisma migrate dev --name add_bi_metrics
```
