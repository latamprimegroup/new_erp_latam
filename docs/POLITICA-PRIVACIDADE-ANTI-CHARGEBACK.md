# Política de Privacidade e Antifraude (Anti-Chargeback)

## 1. Objetivo

Esta política estabelece as regras de privacidade, segurança e prevenção de fraudes da Ads Ativos para vendas de ativos digitais (contas, perfis, acessos e infraestrutura operacional).

Nosso objetivo é:

- proteger clientes legítimos;
- reduzir tentativas de fraude e chargeback indevido;
- manter evidências de conformidade para auditorias e disputas junto a provedores de pagamento e instituições financeiras.

---

## 2. Dados coletados para segurança

Para execução do serviço e prevenção de fraude, podemos coletar:

- dados cadastrais do comprador (nome, documento, e-mail, WhatsApp);
- dados de checkout e pagamento (ID da transação, status, timestamps);
- dados técnicos de segurança (IP, user-agent, fingerprint quando disponível);
- evidências de validação KYC (documento e selfie), quando aplicável por política de risco.

Os dados são utilizados exclusivamente para:

- validar identidade;
- liberar entrega de ativos digitais;
- prevenir chargeback fraudulento;
- cumprir obrigações legais e contratuais.

---

## 3. Regra de risco e KYC

A Ads Ativos opera com limiar de segurança configurável (`security_threshold` / `MIN_VALUE_FOR_KYC`):

- vendas abaixo do limite podem seguir entrega automática;
- vendas iguais ou acima do limite, ou sinalizadas por heurística de risco, entram em fluxo de verificação de identidade.

Nesses casos, o pedido recebe status de verificação pendente até análise e aprovação.

---

## 4. Evidências e auditoria

Para cada venda, registramos trilhas de auditoria com eventos relevantes:

- criação de checkout;
- confirmação de pagamento;
- aceite de termos;
- envio e decisão de KYC;
- ações de antifraude e bloqueio.

Esses registros são mantidos para:

- suporte operacional;
- compliance interno;
- defesa em disputas de pagamento.

---

## 5. Kill Switch antifraude (MED/contestação)

Quando recebemos evento de contestação, MED ou chargeback confirmado:

1. o sistema pode bloquear imediatamente o ativo digital associado (quando tecnicamente aplicável);
2. o documento/e-mail pode ser incluído em blacklist global de risco;
3. um alerta de fraude é registrado para análise interna.

Esse procedimento é uma medida de proteção operacional e patrimonial contra uso indevido de ativos.

---

## 6. Compartilhamento com terceiros

Podemos compartilhar dados estritamente necessários com provedores de infraestrutura, pagamento e antifraude (ex.: Banco Inter, Utmify, AdsPower), sempre sob o princípio da minimização e para execução do serviço.

Não vendemos dados pessoais.

---

## 7. Base legal e retenção

O tratamento de dados ocorre com base em:

- execução contratual;
- legítimo interesse em segurança e prevenção a fraude;
- cumprimento de obrigação legal/regulatória.

Dados de auditoria e antifraude podem ser mantidos pelo período necessário para defesa de direitos, atendimento de exigências legais e segurança da operação.

---

## 8. Direitos do titular

O titular pode solicitar:

- confirmação de tratamento;
- acesso e correção de dados;
- informações sobre compartilhamento;
- revisão de decisões automatizadas, quando aplicável.

Solicitações podem ser feitas pelos canais oficiais de suporte da Ads Ativos.

---

## 9. Termo de aceite em checkout

Para operações com ativos digitais de entrega imediata, o checkout exige aceite explícito do cliente quanto a:

- veracidade dos dados fornecidos;
- possibilidade de verificação de identidade para ativos de maior risco;
- ciência de que, após entrega das credenciais, considera-se a prestação integral do serviço digital consumível.

---

## 10. Contato

Dúvidas sobre privacidade e antifraude podem ser encaminhadas ao suporte oficial da Ads Ativos.

