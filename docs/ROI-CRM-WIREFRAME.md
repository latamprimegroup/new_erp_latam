# Wireframe — Dashboard de ROI & CRM (ADS ATIVOS)

Este documento alinha o wireframe funcional com a implementação no ERP: rotas, modelo de dados e fórmulas.

## 1. Cabeçalho global

| Elemento wireframe | Implementação |
|-------------------|----------------|
| Busca global | `DashboardHeader` + Command Palette (módulos ERP) |
| Busca de cliente nesta tela | Campo local em `/dashboard/roi-crm` → filtra `GET /api/roi-crm/clients?q=` |
| Usuário / Admin / Notificações | Layout do dashboard (shell existente) |

## 2. Título e contexto

- **Rota:** `/dashboard/roi-crm`
- **Arquivos:** `src/app/dashboard/roi-crm/page.tsx`, `RoiCrmDashboardClient.tsx`
- **Texto:** título, subtítulo TinTim + ERP, carimbo “Atualizado em tempo real” com data/hora (atualiza a cada 30s no cliente).

## 3. Integração de dados

### Fonte A — TinTim.app (webhook)

- **Endpoint:** `POST /api/webhooks/tintim`
- **Segurança:** `Authorization: Bearer <TINTIM_WEBHOOK_SECRET>` ou header `X-Tintim-Secret` (opcional; sem secret o endpoint fica aberto — não recomendado em produção).
- **Persistência:** tabela `tintim_lead_events` (`TintimLeadEvent`).
- **Cruzamento:** normalização de telefone/e-mail (`attribution-normalize.ts`); atualiza `ClientProfile.roiAttributionCampaign` e `roiLastAttributionAt` quando há match.

### Fonte B — Vendas / fechamentos ERP

- **Modelo:** `Order` com status considerados “faturamento confirmado” no ROI: `PAID`, `IN_SEPARATION`, `IN_DELIVERY`, `DELIVERED`.
- **Data do fechamento no gráfico diário:** `paidAt` quando existir; senão `createdAt`.
- **Lógica:** `src/lib/roi-crm-queries.ts` → `getRoiDashboardSeries`.

### Investimento em anúncios

- **Tabela:** `ads_spend_daily` (`AdsSpendDaily`) — valor BRL por dia; `source` default `MANUAL` (permite múltiplas fontes por dia com `@@unique([date, source])`).
- **API:** `POST /api/roi-crm/daily-spend` (ADMIN, FINANCE); `GET` lista últimos lançamentos.
- **Google Ads (logs ERP):** `POST /api/roi-crm/sync-google-spend` — agrega `AccountSpendLog.costMicros` por dia (`periodStart`) em `ads_spend_daily` com `source = GOOGLE_ACCOUNT_LOGS` (não substitui lançamentos `MANUAL` do mesmo dia).

### Chave de cruzamento

- **Telefone:** campo `ClientProfile.whatsapp` comparado ao lead.
- **E-mail:** `User.email` do cliente (`clientProfile` vinculado).

## 4. Métricas do dashboard

| Card / visual | Fórmula / regra | Onde |
|---------------|-----------------|------|
| **ROI real** | `((Faturamento − Investimento) / Investimento) × 100`. Se investimento = 0 e faturamento > 0 → exibe “∞”; se ambos 0 → 0 ou “—” conforme UI. | `getRoiDashboardSeries` |
| **LTV (agregado)** | Soma de `ClientProfile.totalSpent` (todos os perfis com valor não nulo). *LTV por linha* na tabela CRM = `totalSpent` do cliente. | Mesma lib + coluna na tabela |
| **CPA real** | `Investimento / quantidade de pedidos` no período (mesmos pedidos “pagos/em entrega” do faturamento). | `getRoiDashboardSeries` |
| **Comparativo diário** | Barras duplas: `investimento` vs `faturamento` por dia (UTC). | Recharts em `RoiCrmDashboardClient` (gradientes `linearGradient`) |

**API:** `GET /api/roi-crm/dashboard?days=7|30|90` (também aceita `from` / `to` opcionais).

## 5. CRM & marketing

- **Lista:** `GET /api/roi-crm/clients` — nome, contato, origem (`roiAttributionCampaign`), status (`roiCrmStatus`: ATIVO, INATIVO, VIP), LTV, pedidos recentes.
- **Histórico:** expansão por cliente; link `Abrir no módulo Vendas` → `/dashboard/vendas?orderId=...`.
- **Atualizar status:** `PATCH /api/roi-crm/clients` body `{ clientId, roiCrmStatus }`.
- **Re-marketing:** `GET /api/roi-crm/remarketing` — clientes inativos (sem compra há 30+ dias, excl. VIP); modal com links `wa.me` e `mailto`.

## 6. Fechamento de caixa diário (visão analítica)

- **API:** `POST /api/roi-crm/daily-close` com `{ date }` — retorna faturamento do dia, investimento do dia, líquido e contagem de pedidos (ADMIN/FINANCE na UI do formulário).

## 7. Design & UX

- **Fundo:** `#09090b` no bloco principal do dashboard ROI.
- **Cards:** borda ciano/azul (`border-cyan-500/35`, sombra suave).
- **Gráficos:** Recharts, mobile-first (`ResponsiveContainer`, grid responsivo).

## 8. Esquema Prisma (resumo)

```text
ClientProfile
  roiCrmStatus, roiAttributionCampaign, roiLastAttributionAt
  tintimLeadEvents[]

TintimLeadEvent
  phoneNormalized, emailNormalized, utm_*, campaignName, matchedClientId, rawPayload

AdsSpendDaily
  date, amountBrl, source, note   @@unique([date, source])
```

## 9. Fluxo “mágica do ROI” (negócio)

1. Lead entra no TinTim → webhook grava evento e, se possível, associa campanha ao `ClientProfile`.
2. Venda registrada no ERP → pedido entra nos status pagos/em entrega.
3. Investimento lançado por dia → `ads_spend_daily`.
4. Dashboard agrega período → ROI, CPA, gráfico diário e CRM alinhados ao mesmo recorte temporal.
