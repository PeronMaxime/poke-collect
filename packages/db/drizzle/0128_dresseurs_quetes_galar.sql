-- Oiseaux de Galar : leurs quêtes seront jouées dans Galar (formes exclusives à la région, une
-- fois celle-ci intégrée). Leurs dresseurs de quêtes passent dans la région Galar, sans zone de
-- Kanto, avec une équipe du Pokédex de Galar. Seulement s'ils sont encore rangés à Kanto.
--> statement-breakpoint
UPDATE "trainers" SET "region_id" = 'galar', "zone_id" = NULL, "team" = '[{"speciesId":858,"formId":null,"level":78,"iv":31,"nature":null},{"speciesId":826,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":876,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":866,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":869,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":884,"formId":null,"level":78,"iv":31,"nature":null}]'::jsonb
WHERE "id" = 'quete-artikodin-galar-selene' AND "region_id" = 'kanto';
--> statement-breakpoint
UPDATE "trainers" SET "region_id" = 'galar', "zone_id" = NULL, "team" = '[{"speciesId":853,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":865,"formId":null,"level":78,"iv":31,"nature":null},{"speciesId":870,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":812,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":823,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":879,"formId":null,"level":79,"iv":31,"nature":null}]'::jsonb
WHERE "id" = 'quete-electhor-galar-kenzo' AND "region_id" = 'kanto';
--> statement-breakpoint
UPDATE "trainers" SET "region_id" = 'galar', "zone_id" = NULL, "team" = '[{"speciesId":887,"formId":null,"level":79,"iv":31,"nature":null},{"speciesId":855,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":864,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":867,"formId":null,"level":77,"iv":31,"nature":null},{"speciesId":851,"formId":null,"level":76,"iv":31,"nature":null},{"speciesId":861,"formId":null,"level":76,"iv":31,"nature":null}]'::jsonb
WHERE "id" = 'quete-sulfura-galar-ambre' AND "region_id" = 'kanto';
