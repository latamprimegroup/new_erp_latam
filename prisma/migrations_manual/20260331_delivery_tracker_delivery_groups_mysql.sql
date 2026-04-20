-- Delivery Tracker — campos em delivery_groups (Prisma: observacoesProducao, operationalBottleneck, trackerUrgent)
-- Requer enum MySQL ou use VARCHAR compatível com a app.

ALTER TABLE `delivery_groups`
  ADD COLUMN `observacoes_producao` TEXT NULL,
  ADD COLUMN `operational_bottleneck` VARCHAR(32) NOT NULL DEFAULT 'AGUARDANDO_PRODUCAO',
  ADD COLUMN `tracker_urgent` BOOLEAN NOT NULL DEFAULT false;
