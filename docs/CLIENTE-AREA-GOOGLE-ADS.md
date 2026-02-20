# Área do Cliente – Gastos, ROI e Contestações

## Funcionalidades

### 1. Minhas Contas e Gastos (`/dashboard/cliente/contas`)
- Lista de contas entregues ao cliente
- **Gasto por conta** (sincronizado via Google Ads API)
- **Taxa de aproveitamento**: contas em uso / contas entregues
- **ROI**: (gasto em campanhas / investimento em contas) × 100%
- Botão "Atualizar gastos" para sincronizar via API

### 2. Contestações (`/dashboard/cliente/contestacoes`)
- **Tipos de ticket:**
  - Conta banida – contestar (informar motivo do banimento)
  - Solicitar reposição
  - Conta pausada – operação comercial
- Campos: motivo do banimento, precisa reposição?, operação comercial?
- Status: Aberto → Em análise → Reposição aprovada / Resolvido / Rejeitado

### 3. Área Comercial/Admin
- `GET/PATCH /api/admin/contestacoes` – listar e resolver tickets
- `PATCH /api/admin/contas/[id]/google-ads-id` – vincular Customer ID do Google Ads à conta

---

## Configuração Google Ads API

### Variáveis de ambiente
```
GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...
GOOGLE_ADS_LOGIN_CUSTOMER_ID=1234567890
```

### Pacote
```bash
npm install google-ads-api
```

### Fluxo
1. Criar projeto no Google Cloud
2. Habilitar Google Ads API
3. Obter Developer Token no Google Ads
4. OAuth para obter Refresh Token (MCC/manager account)
5. O `GOOGLE_ADS_LOGIN_CUSTOMER_ID` é o Customer ID da conta MCC
6. Cada conta entregue deve ter `googleAdsCustomerId` preenchido (admin/estoque)

### Vincular Customer ID à conta
Via API: `PATCH /api/admin/contas/[accountId]/google-ads-id` com body:
```json
{ "googleAdsCustomerId": "123-456-7890" }
```
