-- Réglages faits dans l'admin en local (29 oct.), reportés sur les versions publiée et brouillon.
-- Chaîne chromatique : bonus de 0,1 par expédition, jusqu'à ×6. Ferme : 1 parcelle au départ.
-- Pensions : plus de maximum (balance.daycare.maxSlots retiré du schéma). Groupes du menu et
-- bâtiments à débloquer remplacés par ceux de l'admin.
UPDATE "balance_settings" b
SET "data" = jsonb_set(
  jsonb_set(
    jsonb_set("data", '{shiny,chainMaxMultiplier}', '6'::jsonb),
    '{shiny,chainBonusPerExpedition}', '0.1'::jsonb
  ) #- '{daycare,maxSlots}',
  '{farm}', '{"initialPlots":1}'::jsonb
) || jsonb_build_object(
  'menu', '{"groups":[["expeditions","battles","quests","dungeons"],["center","daycare","museum","farm"],["pc","teams","pokedex","bag","shop"],["trainer","guild","leaderboard"]]}'::jsonb,
  'facilityUnlocks', '{"farm":[],"center":[{"amount":1,"unlock":{"type":"regionUnlocked","regionId":"johto"}},{"amount":1,"unlock":{"type":"regionUnlocked","regionId":"hoenn"}}],"museum":[{"amount":2,"unlock":{"type":"badgeCount","count":4,"regionId":"hoenn"}}],"daycare":[{"amount":1,"unlock":{"type":"badgeCount","count":2,"regionId":"johto"}},{"amount":1,"unlock":{"type":"badgeCount","count":2,"regionId":"hoenn"}}],"incubator":[],"expedition":[{"amount":1,"unlock":{"type":"regionUnlocked","regionId":"johto"}},{"amount":1,"unlock":{"type":"regionUnlocked","regionId":"hoenn"}}]}'::jsonb
)
FROM "content_versions" cv
WHERE cv."id" = b."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
-- Collection de Pikachu : sans Pichu Troizépi (110065, désormais dans celle de Pichu) ni Pikachu
-- Gigamax (10199).
UPDATE "collections" c
SET "form_ids" = (
  SELECT COALESCE(jsonb_agg(f ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(c."form_ids") WITH ORDINALITY AS x(f, i)
  WHERE f NOT IN ('110065'::jsonb, '10199'::jsonb)
),
  "description" = CASE
    WHEN c."description" = '17 formes à capturer, forme par défaut comprise.'
      THEN '16 formes à capturer, forme par défaut comprise.'
    ELSE c."description"
  END
FROM "content_versions" cv
WHERE c."id" = 'formes-pikachu' AND (c."form_ids" @> '[110065]'::jsonb OR c."form_ids" @> '[10199]'::jsonb)
  AND cv."id" = c."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
-- L'Archipel Lointain et sa touriste Maya passent à Alola (Maya n'est plus rattachée à une zone).
UPDATE "zones" z SET "region_id" = 'alola'
FROM "content_versions" cv
WHERE z."id" = 'archipel-lointain'
  AND cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
UPDATE "trainers" t SET "region_id" = 'alola', "zone_id" = NULL
FROM "content_versions" cv
WHERE t."id" = 'touriste-maya'
  AND cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
-- Boutique : Super Ball au 2e badge de Kanto, Hyper Ball au 4e, Rappel au 8e, Patch Talent au
-- 4e badge de Hoenn ; Pilule Talent à 50 000.
UPDATE "shop_entries" e SET "unlock" = u."unlock"
FROM (VALUES
  ('great-ball', '{"type":"badgeCount","count":2,"regionId":"kanto"}'::jsonb),
  ('ultra-ball', '{"type":"badgeCount","count":4,"regionId":"kanto"}'::jsonb),
  ('revive', '{"type":"badgeCount","count":8,"regionId":"kanto"}'::jsonb),
  ('ability-patch', '{"type":"badgeCount","count":4,"regionId":"hoenn"}'::jsonb)
) AS u("id", "unlock"), "content_versions" cv
WHERE e."id" = u."id"
  AND cv."id" = e."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
UPDATE "shop_entries" e SET "price" = 50000
FROM "content_versions" cv
WHERE e."id" = 'ability-capsule'
  AND cv."id" = e."content_version_id" AND cv."status" IN ('published', 'draft');--> statement-breakpoint
-- Boutique : retrait des Capsules d'argent et d'or, Menthes, Pierre Stase, Nœud Destin, objets
-- d'évolution et Baies Framby, ainsi que la catégorie « baies ».
DELETE FROM "shop_entries" e
USING "content_versions" cv
WHERE cv."id" = e."content_version_id" AND cv."status" IN ('published', 'draft')
  AND e."id" IN (
  'bottle-cap', 'everstone', 'moon-stone', 'razz-berry', 'destiny-knot', 'gold-bottle-cap',
  'razz-berry-x5', 'water-stone', 'adamant-mint', 'thunder-stone', 'fire-stone', 'modest-mint',
  'jolly-mint', 'leaf-stone', 'linking-cord', 'timid-mint', 'bold-mint', 'brave-mint', 'calm-mint',
  'careful-mint', 'gentle-mint', 'hasty-mint', 'impish-mint', 'lax-mint', 'lonely-mint',
  'mild-mint', 'naive-mint', 'naughty-mint', 'quiet-mint', 'rash-mint', 'relaxed-mint',
  'sassy-mint', 'serious-mint', 'auspicious-armor', 'berry-sweet', 'black-augurite', 'chipped-pot',
  'clover-sweet', 'cracked-pot', 'dawn-stone', 'deep-sea-scale', 'deep-sea-tooth', 'dragon-scale',
  'dubious-disc', 'dusk-stone', 'electirizer', 'flower-sweet', 'galarica-cuff', 'galarica-wreath',
  'ice-stone', 'kings-rock', 'love-sweet', 'magmarizer', 'malicious-armor', 'masterpiece-teacup',
  'metal-alloy', 'metal-coat', 'oval-stone', 'peat-block', 'prism-scale', 'protector',
  'razor-claw', 'razor-fang', 'reaper-cloth', 'ribbon-sweet', 'sachet', 'scroll-of-darkness',
  'scroll-of-waters', 'shiny-stone', 'star-sweet', 'strawberry-sweet', 'sun-stone', 'sweet-apple',
  'syrupy-apple', 'tart-apple', 'unremarkable-teacup', 'up-grade', 'whipped-dream'
);--> statement-breakpoint
DELETE FROM "shop_categories" c
USING "content_versions" cv
WHERE c."id" = 'baies'
  AND cv."id" = c."content_version_id" AND cv."status" IN ('published', 'draft')
  AND NOT EXISTS (
    SELECT 1 FROM "shop_entries" e
    WHERE e."content_version_id" = c."content_version_id" AND e."category_id" = c."id"
  );
