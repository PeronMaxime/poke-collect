-- Combats de dresseurs en temps réel : structure du contenu, dans toutes les versions (une version
-- archivée est encore relue pour réclamer un combat ou une tentative lancés avec elle).

-- Réglages communs aux combats (donjons et dresseurs) : `balance.combat`, repris de
-- `balance.dungeons` ; les réglages des combats à minuterie et des emplacements disparaissent.
UPDATE "balance_settings" SET "data" = jsonb_set(
  jsonb_set(
    jsonb_set(
      "data",
      '{combat}',
      jsonb_build_object(
        'baseAttackIntervalMs', "data"->'dungeons'->'baseAttackIntervalMs',
        'referenceSpeed', "data"->'dungeons'->'referenceSpeed',
        'minAttackIntervalMs', "data"->'dungeons'->'minAttackIntervalMs',
        'maxAttackIntervalMs', "data"->'dungeons'->'maxAttackIntervalMs',
        'damageMultiplier', "data"->'dungeons'->'damageMultiplier',
        'stabMultiplier', "data"->'dungeons'->'stabMultiplier',
        'minDamageRoll', "data"->'dungeons'->'minDamageRoll',
        'critChance', coalesce("data"->'dungeons'->'critChance', '0.0625'::jsonb),
        'critMultiplier', coalesce("data"->'dungeons'->'critMultiplier', '1.5'::jsonb),
        'recallCooldownSeconds', coalesce("data"->'dungeons'->'recallCooldownSeconds', '5'::jsonb),
        'attacks', "data"->'dungeons'->'attacks',
        'enemyAbilities', coalesce("data"->'dungeons'->'enemyAbilities', 'false'::jsonb)
      )
    ),
    '{dungeons}',
    ("data"->'dungeons') - ARRAY[
      'baseAttackIntervalMs', 'referenceSpeed', 'minAttackIntervalMs', 'maxAttackIntervalMs',
      'damageMultiplier', 'stabMultiplier', 'minDamageRoll', 'critChance', 'critMultiplier',
      'recallCooldownSeconds', 'attacks', 'enemyAbilities'
    ]
  ),
  '{battles}',
  ("data"->'battles') - ARRAY[
    'initialSlots', 'maxSlots', 'defaultDurationMinutes', 'winCurveSteepness', 'minWinChance',
    'maxWinChance', 'typeAdvantageWeight', 'lossXpFraction'
  ]
)
WHERE NOT ("data" ? 'combat');
--> statement-breakpoint

-- Plus d'emplacements de combat : la récompense disparaît des paliers, collections et quêtes.
UPDATE "dex_milestones" SET "rewards" = "rewards" - 'battleSlots' WHERE "rewards" ? 'battleSlots';
--> statement-breakpoint
UPDATE "collections" SET "rewards" = "rewards" - 'battleSlots' WHERE "rewards" ? 'battleSlots';
--> statement-breakpoint
UPDATE "quests" SET "rewards" = "rewards" - 'battleSlots' WHERE "rewards" ? 'battleSlots';
--> statement-breakpoint

-- Modificateurs des combats à minuterie retirés des talents (PE de l'adversaire, avantage de
-- types, durée du combat) ; les talents restent, avec leurs autres effets.
UPDATE "abilities" SET "effects" = (
  SELECT coalesce(jsonb_agg(e ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements("effects") WITH ORDINALITY AS t(e, i)
  WHERE NOT (
    e->>'type' = 'modifier' AND e->>'param' IN ('opponentPower', 'typeAdvantage', 'battleDuration')
  )
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements("effects") AS e
  WHERE e->>'type' = 'modifier' AND e->>'param' IN ('opponentPower', 'typeAdvantage', 'battleDuration')
);
