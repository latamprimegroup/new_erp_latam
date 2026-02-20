# Arquitetura do Agente de IA Autônomo de Produção G2

> Especificação Enterprise — Supervisor inteligente, analista de risco e guardião de ativos

---

## 1. Visão Estratégica

O Agente G2 atua em **4 camadas**:

| Camada | Função | Responsabilidade |
|--------|--------|------------------|
| **Assistente Operacional** | Guia em tempo real | Etapas validadas, bloqueios, sugestões |
| **Supervisor de Qualidade** | Controle pré-aprovação | Checklist obrigatório, score de qualidade |
| **Analista de Performance** | Otimização | Tempo por conta, ranking, gargalos |
| **Controlador de Integridade** | Proteção de ativos | Hash único, bloqueio de reutilização |

**Objetivos:** Meta máxima, qualidade alta, zero reutilização, tempo reduzido, risco mínimo.

---

## 2. Modelo de Dados Proposto

### 2.1 Documentos Obrigatórios por Conta

```
DocumentAsset (novo)
├── id
├── productionG2Id
├── type: RG_FRENTE | RG_VERSO | CARTAO_CNPJ | COMPROVANTE_*
├── storagePath / url
├── contentHash (SHA-256 do arquivo)
├── uploadedById
├── uploadedAt
├── ip
├── validatedAt
├── blockedReason (se rejeitado)
└── consumedByAccountId (vinculação definitiva)
```

### 2.2 Registro de Ativos Únicos (Anti-Reutilização)

```
UniqueAssetRegistry (novo)
├── assetType: CPF | CNPJ | RG_HASH | EMAIL_GOOGLE | RECOVERY_EMAIL | GOOGLE_ADS_ID | PAYMENT_PROFILE | PHONE
├── assetHash (hash do valor para comparação)
├── assetValueNormalized (opcional, mascarado)
├── consumedAt
├── consumedByProductionG2Id
├── consumedByProductionAccountId
└── UNIQUE(assetType, assetHash)
```

### 2.3 Score e Métricas

```
ProductionG2QualityScore (ou campo em ProductionG2)
├── productionG2Id
├── score 0-100
├── checklistPassed
├── docComplete
├── noConflicts
└── calculatedAt

ProducerPerformanceMetrics (cache/agregado)
├── producerId
├── period (month)
├── avgTimePerAccount
├── avgTimePerStep
├── retrabalhoCount
├── errorPatterns (JSON)
├── qualityScoreAvg
└── riskIndex
```

### 2.4 Alertas

```
ProductionAlert (novo)
├── id
├── producerId
├── productionG2Id (opcional)
├── type: DUPLICATE_DOC | META_AT_RISK | LOW_QUALITY | HIGH_RISK | SLOW_PACE | ...
├── severity: INFO | WARNING | CRITICAL
├── message
├── resolvedAt
├── resolvedById
└── createdAt
```

---

## 3. Camadas Funcionais Detalhadas

### Camada 1 — Produção Assistida

| Recurso | Implementação |
|---------|---------------|
| Etapas obrigatórias | Wizard com `canProceed` por etapa |
| Validação de campo | Zod + validações custom (CNPJ, email) |
| Bloqueio de duplicidade | Consulta `UniqueAssetRegistry` antes de salvar |
| Sugestões | API `/api/production-g2/validate-step` retorna erros + sugestões |
| Documentação | Upload com hash, registro em DocumentAsset |

### Camada 2 — Controle de Ativos Únicos

| Ativo | Hash/Fonte | Bloqueio |
|-------|------------|----------|
| CPF | SHA256(normalizado) | Único global |
| CNPJ | SHA256(dígitos) | Único global |
| RG | SHA256(frente+verso) | Único global |
| Email Google | lowercase+trim | Único (já existe) |
| Recovery Email | idem | Único |
| Google Ads ID | normalize 123-456-7890 | Único (já existe) |
| Perfil Pagamento | ID do registro | Único por consumo |
| Telefone | normalize | Único |

### Camada 3 — Gestão Documental

- **Upload:** multipart, validação de tipo MIME, tamanho máximo
- **Hash:** SHA-256 do binário antes de gravar
- **Registro:** userId, ip, timestamp, productionG2Id
- **Pós-aprovação:** documentos imutáveis, apenas visualização mascarada
- **Alertas:** documento ilegível (OCR score baixo), duplicado (hash igual), incompleto (falta tipo)

### Camada 4 — Motor de Meta

```
produção_diária_necessária = (meta_máxima - produção_atual) / dias_restantes
risco = produção_atual < projeção_linear ? 'ALTO' : 'NORMAL'
projeção = produção_atual + (média_diária * dias_restantes)
```

### Camada 5 — Qualidade

**Checklist pré-aprovação:**
- [ ] RG frente anexado
- [ ] RG verso anexado
- [ ] Cartão CNPJ anexado
- [ ] CNPJ validado (Receita)
- [ ] Email único
- [ ] Perfil pagamento único
- [ ] Sem conflitos (hash de ativos)
- [ ] Dados coerentes (CNPJ = cartão)
- [ ] Status completo

**Score:** média ponderada dos itens. Bloqueio se score < 80 ou item crítico falho.

### Camada 6 — Risco Operacional

Indicadores:
- Mesmo nicho usado > X vezes no mês
- Mesmo domínio > Y vezes
- Taxa de reprovação > Z%
- Documentos com histórico de problema
- **Índice de risco:** 0-100, agregação dos fatores

### Camada 7 — Alertas Proativos

| Tipo | Gatilho | Ação |
|------|---------|------|
| DOC_DUPLICATE | Hash já existe | Bloquear upload |
| META_AT_RISK | Projeção < meta | Notificar produtor |
| LOW_QUALITY | Score < 70 | Bloquear aprovação |
| HIGH_RISK | Índice > 70 | Alerta supervisor |
| SLOW_PACE | Tempo/conta > 2x média | Sugerir melhoria |
| EXCESS_REJECT | Taxa reprovação > 20% | Alerta |
| DOC_EXPIRED | Validade vencida | Bloquear |

### Camada 8 — Auditoria Forense

- **AuditLog** existente: expandir actions
- Novas actions: `document_uploaded`, `document_viewed`, `blocked_duplicate`, `blocked_reuse`, `approval_blocked`
- Logs imutáveis, sem DELETE

### Camada 9 — Bloqueios Estruturais

- Aprovação: exige RG frente + verso + Cartão CNPJ
- Reutilização: bloqueada via UniqueAssetRegistry
- Edição pós-aprovação: bloqueada (state machine)
- Exclusão: apenas soft delete (deletedAt)
- ID Google Ads: não editável após criação

### Camada 10 — Dashboard Executivo

KPIs: produção diária/mensal, meta, projeção, score qualidade, índice risco, taxa aprovação, ranking, pendentes, bloqueadas, alertas ativos.

---

## 4. Plano de Implementação em 3 Fases

### Fase 1 — Fundação (4–6 semanas)
- Schema: DocumentAsset, UniqueAssetRegistry, ProductionAlert
- Upload de documentos (RG, Cartão CNPJ) com hash
- Bloqueio de reutilização (consulta hash antes de salvar)
- Checklist expandido (documentos obrigatórios)
- Bloqueio de aprovação sem docs
- Auditoria expandida

### Fase 2 — Inteligência Operacional (4–6 semanas)
- Motor de meta dinâmico (API + UI)
- Score de qualidade por conta
- Tempo médio por conta/etapa (tracking)
- Sistema de alertas (criação + listagem)
- Dashboard do agente
- Ranking de performance

### Fase 3 — Evolução e Escala (4–6 semanas)
- Índice de risco operacional
- Padrões de erro (aprendizado)
- Sugestões automáticas
- Integração multi-equipe (Holding)
- Agente supervisor global

---

## 5. Integração com ERP Existente

| Evento ERP | Ação do Agente |
|------------|----------------|
| Conta aprovada | Envio automático para Estoque (já existe) |
| Conta reprovada | Registro motivo (já existe) |
| Vinculada à venda | Atualizar Entregas (via Order/DeliveryGroup) |
| Reposição | Registrar em ContestationTicket/histórico |

---

## 6. Stack Técnica

- **Validação:** Zod + regras custom em `src/lib/g2-agent/`
- **Hash:** crypto.createHash('sha256')
- **Storage:** S3 ou filesystem (uploads)
- **Cache:** Redis (opcional) para scores e ranking
- **Background:** Vercel Cron ou worker para alertas e métricas

---

## 7. Próximos Passos Imediatos

1. Aprovar arquitetura
2. Fase 1: schema + upload docs + bloqueio reutilização
3. Fase 1: checklist + bloqueio aprovação
4. Fase 2: meta engine + alertas + dashboard
