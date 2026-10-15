-- Donjons : le délai entre deux attaques devient linéaire selon la Vitesse (3 000 ms à Vitesse 0,
-- 2 000 ms à Vitesse 150, 1 000 ms gagnées par tranche de 150 points ; plancher technique 500 ms).
UPDATE "balance_settings" SET "data" = jsonb_set("data", '{dungeons}', ("data" -> 'dungeons') || '{"baseAttackIntervalMs":2000,"referenceSpeed":150,"minAttackIntervalMs":500,"maxAttackIntervalMs":3000}'::jsonb) WHERE "data" ? 'dungeons';
