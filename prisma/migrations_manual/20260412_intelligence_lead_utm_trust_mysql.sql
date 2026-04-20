-- MySQL — Inteligência de Leads: UTM content/term (first+last), trust_score, average_ticket_brl
-- Executar em produção/staging após deploy (ou: npx prisma migrate deploy se gerar migração Prisma equivalente).

ALTER TABLE `intelligence_leads`
  ADD COLUMN `utm_content` VARCHAR(512) NULL AFTER `utm_campaign`,
  ADD COLUMN `utm_term` VARCHAR(200) NULL AFTER `utm_content`,
  ADD COLUMN `utm_first_content` VARCHAR(512) NULL AFTER `utm_first_campaign`,
  ADD COLUMN `utm_first_term` VARCHAR(200) NULL AFTER `utm_first_content`,
  ADD COLUMN `average_ticket_brl` DECIMAL(12, 2) NULL AFTER `total_vendas`,
  ADD COLUMN `trust_score` INT NULL AFTER `average_ticket_brl`;
-- Nota: em bases já antigas, confirme o nome da coluna LTV (`total_vendas`) com SHOW COLUMNS.

CREATE INDEX `intelligence_leads_trust_score_idx` ON `intelligence_leads` (`trust_score`);
