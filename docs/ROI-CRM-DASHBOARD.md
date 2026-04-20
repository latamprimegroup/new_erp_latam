# Dashboard de ROI & CRM — Wireframe, schema e rotas

Este documento alinha o wireframe **“Dashboard de ROI & CRM ADS ATIVOS”** com a implementação no repositório (`/dashboard/roi-crm`).

## 1. Mapa do wireframe → UI

| Wireframe | Implementação |
|-----------|----------------|
| Cabeçalho (busca, usuário, notificações) | Shell global (`DashboardHeader`) + busca local “Buscar cliente” na página ROI & CRM |
| Título + descrição + data/hora | `RoiCrmDashboardClient` — relógio atualizado a cada 30s |
| Integração Fonte A/B + chave | Card “1. Integração de dados” |
| Cards ROI, LTV, CPA, resumo | Grid 4 colunas (responsivo) |
| Gráfico diário investimento vs faturamento | `recharts` `BarChart` com gradientes (`linearGradient`) |
| Tabela CRM + histórico + remarketing | Seção “3. CRM & marketing” + modal re-marketing |
| Lançamento investimento / fechamento dia | Formulário visível para ADMIN/FINANCE |

## 2. Modelo de dados (Prisma)

### `TintimLeadEvent` (`tintim_lead_events`)

- Lead da **Fonte A** (webhook TinTim ou similar).
- Campos: `phoneNormalized`, `emailNormalized`, `utm_*`, `campaignName`, `externalId`, `rawPayload`, `matchedClientId`.
- **Cruzamento**: normalização de telefone/e-mail (`@/lib/attribution-normalize`) com `User` / `ClientProfile`.

### `AdsSpendDaily` (`ads_spend_daily`)

- **Investimento em ads** por dia (`date`, `amountBrl`, `source` MANUAL ou futuro GOOGLE_SYNC).
- Unique `[date, source]` para não duplicar a mesma fonte no mesmo dia.

### `ClientProfile` (campos ROI/CRM)

- `roiCrmStatus`: `ATIVO` | `INATIVO` | `VIP`.
- `roiAttributionCampaign`: última campanha atribuída (preenchida ao casar webhook com cliente).
- `roiLastAttributionAt`.
- `totalSpent`, `lastPurchaseAt`: base para LTV e re-marketing.

### `Order`

- **Fonte B**: faturamento com status “pagamento confirmado / pós-pagamento” (`PAID`, `IN_SEPARATION`, `IN_DELIVERY`, `DELIVERED`), data por `paidAt` ou `createdAt` (ver `src/lib/roi-crm-queries.ts`).

## 3. Rotas de API

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/webhooks/tintim` | Recebe lead; opcional `TINTIM_WEBHOOK_SECRET` |
| GET | `/api/roi-crm/dashboard?days=7\|30\|90` | ROI, LTV agregado, CPA, série diária |
| GET | `/api/roi-crm/clients?q=` | Tabela CRM + pedidos |
| PATCH | `/api/roi-crm/clients` | Atualiza `roiCrmStatus` |
| GET | `/api/roi-crm/remarketing` | Lista inativos 30d+ (exceto `roiCrmStatus=INATIVO`) com links wa.me/mailto |
| POST | `/api/roi-crm/daily-spend` | `{ date, amountBrl }` — ADMIN/FINANCE |
| POST | `/api/roi-crm/daily-close` | Cálculo líquido de um dia (faturamento − investimento) |
| POST | `/api/roi-crm/sync-google-spend` | Placeholder; evoluir para Google Ads / `AccountSpendLog` |

## 4. Fórmulas

- **ROI real (%)**: `spend > 0` → `((revenue - spend) / spend) * 100`; sem investimento com faturamento → exibição “∞”; sem dados → “—”.
- **CPA real**: `spend / ordersCount` quando ambos > 0.
- **LTV no card agregado**: soma de `totalSpent` dos perfis com valor não nulo (indicador de carteira; na tabela, LTV por cliente).

## 5. Variáveis de ambiente

Ver `.env.example` (seção ROI & CRM): `TINTIM_WEBHOOK_SECRET`.

## 6. Próximos passos técnicos sugeridos

1. Implementar `sync-google-spend` agregando custo diário (ex.: `AccountSpendLog` ou API Google Ads).
2. Job agendado para fechamento diário automático (opcional).
3. Enriquecer webhook TinTim com IDs de campanha/cliques conforme contrato real da ferramenta.
