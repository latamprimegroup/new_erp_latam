# Relatório Diário Avançado

## Visão geral

O relatório diário consolida **vendas**, **produção** e **progresso das metas** em um único resumo, enviado aos admins via push (iPhone) e in-app.

## Conteúdo

### Produção
- Contas produzidas **hoje**
- Contas produzidas no **mês** (vs meta)
- **Faltam** X contas para bater a meta
- **Ritmo necessário** (contas/dia para chegar na meta)
- **Projeção** do mês (se continuar no ritmo atual)
- Indicador: **meta em risco** ou **no ritmo**

### Vendas
- Contas vendidas **hoje** + pedidos + valor (R$)
- Contas vendidas no **mês** (vs meta)
- Faturamento do mês
- Faltam X contas para meta
- Ritmo necessário
- Indicador: no ritmo ou não

## Envio

### Automático (Cron)
- **Horário**: 20h (todos os dias)
- **Rota**: `POST /api/cron/relatorio-diario`
- **Autenticação**: `?secret=CRON_SECRET` ou `Authorization: Bearer CRON_SECRET`

### Manual
- Admin acessa **Admin → Relatório Diário**
- Clica em **Enviar notificação agora**

## Configuração

No `vercel.json`:
```json
{
  "crons": [
    {"path": "/api/cron/relatorio-diario", "schedule": "0 20 * * *"}
  ]
}
```

Variável `CRON_SECRET` no .env (Vercel).

## API

- **GET** `/api/admin/relatorio-diario` — retorna o relatório completo (JSON)
- **POST** `/api/admin/relatorio-diario` — envia notificação para todos os admins
