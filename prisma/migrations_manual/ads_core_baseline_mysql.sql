-- ADS CORE — baseline MySQL (execute após alinhar com prisma/schema.prisma).
-- Ajuste nomes de tabela/coluna se o banco legado diferir.

-- Nichos
-- CREATE TABLE IF NOT EXISTS `ads_core_niches` (...);

-- Ativos: unicidade CNPJ e site (footprint)
-- Verifique se já existem antes de aplicar:
-- SHOW INDEX FROM `ads_core_assets` WHERE Key_name IN ('ads_core_assets_cnpj_key', 'ads_core_assets_site_url_key');

-- ALTER TABLE `ads_core_assets` ADD UNIQUE KEY `ads_core_assets_cnpj_key` (`cnpj`);
-- ALTER TABLE `ads_core_assets` ADD UNIQUE KEY `ads_core_assets_site_url_key` (`site_url`);

-- Registro permanente de CNPJ (bloqueio pós-exclusão) — ver ads_core_cnpj_registry_mysql.sql
