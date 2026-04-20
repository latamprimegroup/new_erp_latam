-- ADS CORE: tipo de meta de verificação por ativo (MySQL)
-- Execute após alinhar o schema Prisma (`npx prisma generate`).

ALTER TABLE `ads_core_assets`
  ADD COLUMN `verification_track` ENUM('G2_ANUNCIANTE', 'ANUNCIANTE_COMERCIAL') NOT NULL DEFAULT 'G2_ANUNCIANTE'
  AFTER `status_producao`;
