-- Nouvelles baies (Sitrus : soin en combat ; Grena : bonheur ; Nanana : rencontres en
-- expédition), toutes plantables à la ferme. Les baies deviennent rares : plus vendues en
-- boutique ni données au départ, et beaucoup moins fréquentes en expédition (seulement si les
-- chances n'ont pas été retouchées dans l'admin). Toutes les versions de contenu.
INSERT INTO "items" ("content_version_id", "id", "name", "description", "icon", "category", "rarity", "sell_price", "effects")
SELECT v."id", i."id", i."name", i."description", NULL, 'berry', 'uncommon', 150, i."effects"::jsonb
FROM "content_versions" v
CROSS JOIN (VALUES
  ('sitrus-berry', 'Baie Sitrus', 'Donnée en combat au Pokémon actif : lui rend un quart de ses PV.', '[{"type":"battleHeal","fraction":0.25},{"type":"berryPlant","minutes":60,"minYield":1,"maxYield":3}]'),
  ('pomeg-berry', 'Baie Grena', 'Donnée à un Pokémon : son bonheur augmente un peu.', '[{"type":"happiness","amount":1},{"type":"berryPlant","minutes":60,"minYield":1,"maxYield":3}]'),
  ('nanab-berry', 'Baie Nanana', 'Emportée en expédition : plus de rencontres. Une baie par heure d’expédition.', '[{"type":"encounterBoost","multiplier":1.25},{"type":"berryPlant","minutes":60,"minYield":1,"maxYield":3}]')
) AS i("id", "name", "description", "effects")
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Framby plus rare : 2 %, une seule à la fois (au lieu de 25 % / 35 %, 1 à 2).
UPDATE "loot_tables" lt
SET "entries" = (
  SELECT jsonb_agg(
    CASE
      WHEN e->>'itemId' = 'razz-berry'
        AND (e->>'chance')::numeric = CASE lt."id" WHEN 'butin-route' THEN 0.25 ELSE 0.35 END
        AND (e->>'min')::int = 1 AND (e->>'max')::int = 2
      THEN '{"itemId":"razz-berry","chance":0.02,"min":1,"max":1}'::jsonb
      ELSE e
    END ORDER BY o)
  FROM jsonb_array_elements(lt."entries") WITH ORDINALITY AS t(e, o)
)
WHERE lt."id" IN ('butin-route', 'butin-foret');--> statement-breakpoint
-- Nouvelles baies ajoutées en fin de butin (route, forêt, berges), si absentes.
UPDATE "loot_tables" lt
SET "entries" = lt."entries" || n."entries"::jsonb
FROM (VALUES
  ('butin-route', 'nanab-berry', '[{"itemId":"nanab-berry","chance":0.015,"min":1,"max":1}]'),
  ('butin-foret', 'pomeg-berry', '[{"itemId":"pomeg-berry","chance":0.015,"min":1,"max":1},{"itemId":"sitrus-berry","chance":0.01,"min":1,"max":1}]'),
  ('butin-mer', 'sitrus-berry', '[{"itemId":"sitrus-berry","chance":0.015,"min":1,"max":1},{"itemId":"nanab-berry","chance":0.01,"min":1,"max":1}]')
) AS n("id", "first", "entries")
WHERE lt."id" = n."id"
  AND NOT lt."entries" @> jsonb_build_array(jsonb_build_object('itemId', n."first"));--> statement-breakpoint
-- Baies plus vendues en boutique.
UPDATE "shop_entries" SET "enabled" = false WHERE "id" IN ('razz-berry', 'razz-berry-x5');--> statement-breakpoint
-- Plus de Framby dans l'inventaire de départ.
UPDATE "balance_settings"
SET "data" = jsonb_set(
  "data",
  '{newPlayer,startingInventory}',
  (SELECT coalesce(jsonb_agg(e ORDER BY o), '[]'::jsonb)
   FROM jsonb_array_elements("data"->'newPlayer'->'startingInventory') WITH ORDINALITY AS t(e, o)
   WHERE e->>'itemId' <> 'razz-berry')
)
WHERE "data"->'newPlayer'->'startingInventory' @> '[{"itemId":"razz-berry"}]'::jsonb;
