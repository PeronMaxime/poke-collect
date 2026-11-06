-- Bonbons de lignée : plus d'XP fixe par Bonbon. Un Bonbon donne 1/N du niveau en cours, N allant
-- de 5 Bonbons (niveau 1) à 20 (niveau 99) en ligne droite ; le surplus passe au niveau suivant.
-- Les deux réglages ne sont ajoutés que s'ils n'existent pas encore (réglables dans l'admin).
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data",
  '{transfer}',
  ('{"candiesPerLevelStart":5,"candiesPerLevelEnd":20}'::jsonb || ("data"->'transfer')) - 'xpPerCandy'
)
WHERE "data" ? 'transfer';
