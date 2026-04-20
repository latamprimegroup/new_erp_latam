-- Módulo 10 — valor bruto de referência por oferta (alertas de precificação).
ALTER TABLE tracker_offers
  ADD COLUMN reference_gross_brl DECIMAL(14, 2) NULL;
