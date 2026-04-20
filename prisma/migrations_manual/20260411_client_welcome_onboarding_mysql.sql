-- Welcome Experience — flag de onboarding (mentorado). Existentes: fechado para não mostrar modal em massa.
ALTER TABLE `client_profiles`
  ADD COLUMN `welcome_onboarding_pending` BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE `client_profiles` SET `welcome_onboarding_pending` = FALSE;
