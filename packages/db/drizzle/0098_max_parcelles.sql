-- Ferme limitée à 18 parcelles : 17 parcelles achetables au plus en boutique (limite d'achat au
-- total), versions publiée et brouillon encore sans limite.
UPDATE "shop_entries" e
SET "purchase_limit" = '{"lots":17,"period":"total"}'::jsonb
FROM "content_versions" cv
WHERE cv."id" = e."content_version_id" AND cv."status" IN ('published', 'draft')
  AND e."id" = 'parcelle-ferme' AND e."purchase_limit" IS NULL;
