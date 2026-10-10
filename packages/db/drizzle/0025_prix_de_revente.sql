-- Prix de revente par défaut des objets existants : la moitié du prix unitaire le plus bas des
-- articles actifs, sinon selon la rareté ; les objets légendaires restent invendables.
UPDATE "items" i SET "sell_price" = COALESCE(
  (SELECT floor(min(e."price"::numeric / e."lot_size") / 2)::integer
   FROM "shop_entries" e
   WHERE e."content_version_id" = i."content_version_id" AND e."item_id" = i."id" AND e."enabled"),
  CASE i."rarity"
    WHEN 'common' THEN 50
    WHEN 'uncommon' THEN 150
    WHEN 'rare' THEN 1000
    WHEN 'epic' THEN 3000
  END
)
WHERE i."sell_price" IS NULL;
