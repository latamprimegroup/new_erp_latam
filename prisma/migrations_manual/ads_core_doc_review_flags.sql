-- ADS CORE Bloco 3: checklist de documentos (gerente)
ALTER TABLE "ads_core_assets" ADD COLUMN IF NOT EXISTS "doc_review_flags" JSONB;
