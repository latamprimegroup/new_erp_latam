-- ADS CORE: congruência persistida + histórico de URLs (MySQL).
-- Execute após alinhar schema Prisma com estas colunas.

ALTER TABLE `ads_core_assets`
  ADD COLUMN `congruencia_check` BOOLEAN NOT NULL DEFAULT FALSE
    COMMENT 'Resultado automático CNAE vs nicho (true = passou na validação)';

ALTER TABLE `ads_core_assets`
  ADD COLUMN `historico_urls` JSON NULL
    COMMENT 'Histórico de alterações em site_url [{at,userId,old,new}]';

UPDATE `ads_core_assets` SET `historico_urls` = JSON_ARRAY() WHERE `historico_urls` IS NULL;
