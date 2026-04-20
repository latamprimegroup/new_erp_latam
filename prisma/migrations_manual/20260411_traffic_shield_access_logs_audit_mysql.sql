-- Módulo 09 — campos de auditoria granular nos logs do Traffic Shield (MySQL).
-- Executar manualmente no ambiente antes de usar ingest/UI com os novos campos.

ALTER TABLE traffic_shield_access_logs
  ADD COLUMN gclid VARCHAR(512) NULL,
  ADD COLUMN utm_campaign VARCHAR(512) NULL,
  ADD COLUMN utm_content VARCHAR(512) NULL,
  ADD COLUMN shield_profile VARCHAR(16) NULL,
  ADD COLUMN device_category VARCHAR(24) NULL,
  ADD COLUMN browser_family VARCHAR(64) NULL,
  ADD COLUMN isp_name VARCHAR(200) NULL,
  ADD COLUMN session_duration_ms INT NULL,
  ADD COLUMN uni_id CHAR(36) NULL;

CREATE INDEX idx_tsal_uni_created ON traffic_shield_access_logs (uni_id, created_at);

ALTER TABLE traffic_shield_access_logs
  ADD CONSTRAINT fk_tsal_uni FOREIGN KEY (uni_id) REFERENCES vault_industrial_units(id) ON DELETE SET NULL;
