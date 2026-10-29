ALTER TABLE "zones" ADD COLUMN "special_encounters" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Rencontres spéciales des formes événementielles (Pikachu Partenaire et à casquette, Pikachu
-- Cosplay, Évoli Partenaire, Pichu Troizépi) : zones des versions publiée et brouillon encore sans
-- rencontre spéciale. Même liste que seed-special-encounters.ts.
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":133,"formId":10159,"minLevel":3,"maxLevel":5,"requiredSpeciesId":25,"requiredFormId":null,"chance":2,"hint":"Quelque chose remue dans les hautes herbes, comme si l’on guettait le passage d’une souris électrique."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'route-1' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10158,"minLevel":4,"maxLevel":7,"requiredSpeciesId":133,"requiredFormId":null,"chance":2,"hint":"Des étincelles crépitent entre les arbres, comme pour saluer un Pokémon aux mille évolutions."},{"speciesId":25,"formId":10094,"minLevel":4,"maxLevel":7,"requiredSpeciesId":10,"requiredFormId":null,"chance":2,"hint":"Une casquette rouge et blanche pend à une branche, là où un jeune dresseur captura jadis une petite chenille."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'foret-de-jade' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10160,"minLevel":42,"maxLevel":48,"requiredSpeciesId":6,"requiredFormId":null,"chance":2,"hint":"Une casquette aux couleurs du monde flotte au vent. Seul le souffle d’un dragon de feu semble pouvoir l’atteindre."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'route-victoire' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10148,"minLevel":45,"maxLevel":50,"requiredSpeciesId":250,"requiredFormId":null,"chance":2,"hint":"Au sommet de la tour, un arc-en-ciel rappelle le jour où un dresseur et son partenaire virent passer le gardien des cieux."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'tour-carillon' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":172,"formId":110065,"minLevel":40,"maxLevel":44,"requiredSpeciesId":251,"requiredFormId":null,"chance":2,"hint":"Le temps vacille autour de l’autel. Un petit Pokémon venu du passé n’attend que le retour du voyageur du temps."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'autel-bois-aux-chenes' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10095,"minLevel":4,"maxLevel":6,"requiredSpeciesId":252,"requiredFormId":null,"chance":2,"hint":"Une casquette verte a été oubliée sur un tronc, là où un dresseur se lia d’amitié avec un petit gecko."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'bois-clementi' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10085,"minLevel":10,"maxLevel":13,"requiredSpeciesId":311,"requiredFormId":null,"chance":2,"hint":"Une loge de costumes s’est installée près de la salle des Concours. Elle n’ouvre qu’aux supporters les plus positifs."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'route-109' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10083,"minLevel":14,"maxLevel":18,"requiredSpeciesId":376,"requiredFormId":null,"chance":2,"hint":"Un chercheur en blouse griffonne des équations. Il ne parle qu’à un esprit d’acier aux quatre pattes."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'labo-seko' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10082,"minLevel":18,"maxLevel":22,"requiredSpeciesId":334,"requiredFormId":null,"chance":2,"hint":"Un chant cotonneux résonne au-dessus des falaises. Une star des Concours attend qu’un oiseau-nuage l’accompagne."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'routes-114-115' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10080,"minLevel":22,"maxLevel":28,"requiredSpeciesId":310,"requiredFormId":null,"chance":2,"hint":"Un riff de guitare électrique résonne dans la centrale. Le musicien ne monte sur scène qu’avec un chien d’orage."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'new-lavandia' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10081,"minLevel":28,"maxLevel":34,"requiredSpeciesId":350,"requiredFormId":null,"chance":2,"hint":"À la surface de l’eau, un reflet d’une rare élégance. Il ne se dévoile qu’au plus beau des Pokémon."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'routes-119-120' AND z."special_encounters" = '[]'::jsonb;--> statement-breakpoint
UPDATE "zones" z
SET "special_encounters" = '[{"speciesId":25,"formId":10084,"minLevel":45,"maxLevel":52,"requiredSpeciesId":297,"requiredFormId":null,"chance":2,"hint":"Un masque de catcheur traîne au bord du ring. Son propriétaire ne défie que les lutteurs de sumo."}]'::jsonb
FROM "content_versions" cv
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft')
  AND z."id" = 'zone-de-combat' AND z."special_encounters" = '[]'::jsonb;
