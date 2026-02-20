# Changelog — Melhorias e Novas Funcionalidades

> Atualizações implementadas para ampliar o ERP Ads Ativos

---

## Agente G2 — Fase 2

### Dashboard do Agente
- **Rota:** `/dashboard/producao-g2/agente`
- Meta, projeção, ritmo necessário
- **Ranking de produtores** (produção validada no mês)
- **Alertas ativos** (bloqueios, documentos, etc.)

### API Ranking
- `GET /api/production-g2/agent/ranking` — ranking por produção no mês

### API Alertas
- `GET /api/production-g2/agent/alerts` — listar alertas (filtros: producerId, type, resolved)

---

## Relatório Diário

### Ranking no relatório
- Top produtores do mês no relatório
- Exibido na UI e no resumo textual

### Notificações
- Push diário às 20h (cron)
- Inclui ranking top 5 no resumo

---

## Notificações

### ProductionAccount em análise
- Quando produtor cria conta (status PENDING), admins recebem push:
  - "Conta produção em análise — [plataforma] — [produtor]"

### Cobertura completa
- G2: em análise, aprovada, em estoque
- Produção: em análise, aprovada
- Vendas: realizada
- Relatório diário: 20h

---

## Diagnóstico e Deploy

### Health detalhado
- `GET /api/health/detailed` — DB, env vars, versão
- Link no painel Admin → Agente Deploy

---

## Resumo de rotas novas

| Rota | Método | Descrição |
|------|--------|-----------|
| `/dashboard/producao-g2/agente` | — | Dashboard Agente G2 |
| `/api/production-g2/agent/ranking` | GET | Ranking produtores |
| `/api/production-g2/agent/alerts` | GET | Alertas |
| `/api/health/detailed` | GET | Health check detalhado |
