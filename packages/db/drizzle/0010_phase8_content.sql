-- Phase 8 : régions Johto, Hoenn et Sinnoh.
INSERT INTO "regions" ("content_version_id", "id", "order", "name", "image", "species_ids", "starter_species_ids", "unlock")
SELECT v."id", 'johto', 1, 'Johto', NULL, '[152,153,154,155,156,157,158,159,160,161,162,163,164,165,166,167,168,169,170,171,172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197,198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225,226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,246,247,248]'::jsonb, '[]'::jsonb, '{"type":"regionDexPercent","regionId":"kanto","percent":50}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "regions" ("content_version_id", "id", "order", "name", "image", "species_ids", "starter_species_ids", "unlock")
SELECT v."id", 'hoenn', 2, 'Hoenn', NULL, '[252,253,254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,281,282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317,318,319,320,321,322,323,324,325,326,327,328,329,330,331,332,333,334,335,336,337,338,339,340,341,342,343,344,345,346,347,348,349,350,351,352,353,354,355,356,357,358,359,360,361,362,363,364,365,366,367,368,369,370,371,372,373,374,375,376]'::jsonb, '[]'::jsonb, '{"type":"regionDexPercent","regionId":"johto","percent":50}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "regions" ("content_version_id", "id", "order", "name", "image", "species_ids", "starter_species_ids", "unlock")
SELECT v."id", 'sinnoh', 3, 'Sinnoh', NULL, '[387,388,389,390,391,392,393,394,395,396,397,398,399,400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,419,420,421,422,423,424,425,426,427,428,429,430,431,432,433,434,435,436,437,438,439,440,441,442,443,444,445,446,447,448,449,450,451,452,453,454,455,456,457,458,459,460,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478,479]'::jsonb, '[]'::jsonb, '{"type":"regionDexPercent","regionId":"hoenn","percent":50}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Zones : Archipel Lointain (formes régionales) et zones des nouvelles régions.
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'archipel-lointain', 'kanto', 10, 'Archipel Lointain', 'Des îles au climat étrange, au large de Kanto : les Pokémon y ont pris d’autres formes.', 'waters-edge', 400, '["ice","dark","psychic"]'::jsonb, '[{"speciesId":19,"formId":10091,"weight":20,"minLevel":18,"maxLevel":22},{"speciesId":37,"formId":10103,"weight":12,"minLevel":18,"maxLevel":22},{"speciesId":27,"formId":10101,"weight":12,"minLevel":18,"maxLevel":22},{"speciesId":50,"formId":10105,"weight":12,"minLevel":18,"maxLevel":22},{"speciesId":52,"formId":10107,"weight":10,"minLevel":18,"maxLevel":22},{"speciesId":52,"formId":10161,"weight":6,"minLevel":18,"maxLevel":22},{"speciesId":74,"formId":10109,"weight":10,"minLevel":20,"maxLevel":24},{"speciesId":77,"formId":10162,"weight":6,"minLevel":20,"maxLevel":24},{"speciesId":58,"formId":10229,"weight":5,"minLevel":20,"maxLevel":24},{"speciesId":79,"formId":10164,"weight":4,"minLevel":20,"maxLevel":24},{"speciesId":88,"formId":10112,"weight":3,"minLevel":22,"maxLevel":26}]'::jsonb, 'butin-mer', '{"type":"regionDexPercent","regionId":"kanto","percent":50}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'route-29', 'johto', 0, 'Route 29', 'Le chemin herbeux qui relie Bourg Geon à Ville Griotte.', 'grassland', 0, '["normal","flying"]'::jsonb, '[{"speciesId":161,"weight":30,"minLevel":3,"maxLevel":6},{"speciesId":163,"weight":25,"minLevel":3,"maxLevel":6},{"speciesId":165,"weight":15,"minLevel":4,"maxLevel":6},{"speciesId":187,"weight":15,"minLevel":4,"maxLevel":6},{"speciesId":167,"weight":15,"minLevel":4,"maxLevel":6}]'::jsonb, 'butin-route', '{"type":"always"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'tour-chetiflor', 'johto', 1, 'Tour Chétiflor', 'Une vieille tour de bois qui oscille doucement. Des ombres y rôdent la nuit.', 'urban', 200, '["ghost","psychic","dark"]'::jsonb, '[{"speciesId":177,"weight":25,"minLevel":10,"maxLevel":14},{"speciesId":198,"weight":20,"minLevel":10,"maxLevel":14},{"speciesId":200,"weight":15,"minLevel":12,"maxLevel":15},{"speciesId":167,"weight":25,"minLevel":9,"maxLevel":12},{"speciesId":203,"weight":15,"minLevel":12,"maxLevel":15}]'::jsonb, 'butin-grotte', '{"type":"regionDexPercent","regionId":"johto","percent":5}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[{"type":"water","count":1}]'::jsonb, '[15,60,240,480]'::jsonb, 'lac-colere', 'johto', 2, 'Lac Colère', 'Un grand lac agité. On murmure qu’un Léviator rouge y aurait été aperçu.', 'waters-edge', 400, '["water"]'::jsonb, '[{"speciesId":183,"weight":25,"minLevel":15,"maxLevel":20},{"speciesId":194,"weight":20,"minLevel":15,"maxLevel":20},{"speciesId":194,"formId":10253,"weight":5,"minLevel":15,"maxLevel":20},{"speciesId":170,"weight":15,"minLevel":18,"maxLevel":22},{"speciesId":223,"weight":15,"minLevel":18,"maxLevel":22},{"speciesId":211,"weight":10,"minLevel":20,"maxLevel":24}]'::jsonb, 'butin-mer', '{"type":"trainerDefeated","trainerId":"albert"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'route-101', 'hoenn', 0, 'Route 101', 'Les herbes folles au nord de Bourg-en-Vol, là où tout commence à Hoenn.', 'grassland', 0, '["normal","bug","dark"]'::jsonb, '[{"speciesId":263,"weight":30,"minLevel":4,"maxLevel":7},{"speciesId":263,"formId":10174,"weight":3,"minLevel":4,"maxLevel":7},{"speciesId":265,"weight":25,"minLevel":4,"maxLevel":7},{"speciesId":261,"weight":25,"minLevel":4,"maxLevel":7},{"speciesId":276,"weight":12,"minLevel":5,"maxLevel":8}]'::jsonb, 'butin-route', '{"type":"always"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'grotte-granite', 'hoenn', 1, 'Grotte Granite', 'Une grotte de l’île de Village Myokara, aux parois couvertes de fresques.', 'cave', 300, '["rock","fighting","steel"]'::jsonb, '[{"speciesId":296,"weight":25,"minLevel":10,"maxLevel":14},{"speciesId":304,"weight":25,"minLevel":10,"maxLevel":14},{"speciesId":302,"weight":10,"minLevel":12,"maxLevel":15},{"speciesId":299,"weight":15,"minLevel":12,"maxLevel":15},{"speciesId":293,"weight":25,"minLevel":10,"maxLevel":13}]'::jsonb, 'butin-grotte', '{"type":"regionDexPercent","regionId":"hoenn","percent":5}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'route-201', 'sinnoh', 0, 'Route 201', 'Un sentier tranquille entre Bonaugure et Littorella, battu par le vent du lac.', 'grassland', 0, '["normal","flying","bug"]'::jsonb, '[{"speciesId":396,"weight":30,"minLevel":4,"maxLevel":7},{"speciesId":399,"weight":30,"minLevel":4,"maxLevel":7},{"speciesId":401,"weight":20,"minLevel":4,"maxLevel":7},{"speciesId":403,"weight":20,"minLevel":5,"maxLevel":8}]'::jsonb, 'butin-route', '{"type":"always"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "zones" ("content_version_id", "image", "required_types", "durations_minutes", "id", "region_id", "order", "name", "description", "habitat", "min_power", "affinity_types", "encounters", "loot_table_id", "unlock")
SELECT v."id", NULL, '[]'::jsonb, '[15,60,240,480]'::jsonb, 'mont-couronne', 'sinnoh', 1, 'Mont Couronné', 'La montagne qui coupe Sinnoh en deux. Ses grottes cachent des Pokémon rares.', 'mountain', 600, '["rock","steel","ice","dragon"]'::jsonb, '[{"speciesId":436,"weight":25,"minLevel":20,"maxLevel":25},{"speciesId":459,"weight":20,"minLevel":20,"maxLevel":25},{"speciesId":408,"weight":10,"minLevel":22,"maxLevel":26},{"speciesId":410,"weight":10,"minLevel":22,"maxLevel":26},{"speciesId":443,"weight":4,"minLevel":24,"maxLevel":28},{"speciesId":433,"weight":15,"minLevel":20,"maxLevel":24}]'::jsonb, 'butin-grotte', '{"type":"trainerDefeated","trainerId":"pierrick"}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Dresseurs et Champions des nouvelles régions.
INSERT INTO "trainers" ("content_version_id", "sprite", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock", "id", "region_id", "zone_id", "order", "name", "trainer_class", "team")
SELECT v."id", 'https://play.pokemonshowdown.com/sprites/trainers/lass-gen4.png', 30, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 900, 'butin-mer', 2, NULL, true, NULL, NULL, '{"type":"regionDexPercent","regionId":"kanto","percent":50}'::jsonb, 'touriste-maya', 'kanto', 'archipel-lointain', 11, 'Maya', 'Touriste', '[{"speciesId":37,"formId":10103,"level":24,"iv":null,"nature":null},{"speciesId":27,"formId":10101,"level":24,"iv":null,"nature":null},{"speciesId":52,"formId":10161,"level":26,"iv":null,"nature":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "sprite", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock", "id", "region_id", "zone_id", "order", "name", "trainer_class", "team")
SELECT v."id", 'https://play.pokemonshowdown.com/sprites/trainers/youngster-gen4.png', 10, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 150, 'butin-route', 1, NULL, true, NULL, NULL, '{"type":"always"}'::jsonb, 'gamin-joey', 'johto', 'route-29', 0, 'Joey', 'Gamin', '[{"speciesId":161,"level":6,"iv":null,"nature":null},{"speciesId":19,"level":6,"iv":null,"nature":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "sprite", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock", "id", "region_id", "zone_id", "order", "name", "trainer_class", "team")
SELECT v."id", 'https://play.pokemonshowdown.com/sprites/trainers/falkner.png', 60, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 1800, 'butin-route', 3, '{"name":"Badge Zéphyr","image":null}'::jsonb, false, NULL, NULL, '{"type":"trainerDefeated","trainerId":"gamin-joey"}'::jsonb, 'albert', 'johto', NULL, 1, 'Albert', 'Champion d’arène', '[{"speciesId":16,"level":13,"iv":null,"nature":null},{"speciesId":163,"level":14,"iv":null,"nature":null},{"speciesId":17,"level":16,"iv":null,"nature":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "sprite", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock", "id", "region_id", "zone_id", "order", "name", "trainer_class", "team")
SELECT v."id", 'https://play.pokemonshowdown.com/sprites/trainers/hiker-gen3.png', 20, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 400, 'butin-grotte', 1, NULL, true, NULL, NULL, '{"type":"always"}'::jsonb, 'montagnard-bruno', 'hoenn', 'grotte-granite', 0, 'Bruno', 'Montagnard', '[{"speciesId":296,"level":13,"iv":null,"nature":null},{"speciesId":304,"level":14,"iv":null,"nature":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "sprite", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock", "id", "region_id", "zone_id", "order", "name", "trainer_class", "team")
SELECT v."id", 'https://play.pokemonshowdown.com/sprites/trainers/roxanne.png', 60, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 2400, 'butin-grotte', 3, '{"name":"Badge Rocher","image":null}'::jsonb, false, NULL, NULL, '{"type":"trainerDefeated","trainerId":"montagnard-bruno"}'::jsonb, 'roxanne', 'hoenn', NULL, 1, 'Roxanne', 'Championne d’arène', '[{"speciesId":74,"level":15,"iv":null,"nature":null},{"speciesId":74,"level":15,"iv":null,"nature":null},{"speciesId":299,"level":18,"iv":null,"nature":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "trainers" ("content_version_id", "sprite", "duration_minutes", "rules", "money", "loot_table_id", "loot_rolls", "badge", "repeatable", "cooldown_minutes", "ko_minutes", "unlock", "id", "region_id", "zone_id", "order", "name", "trainer_class", "team")
SELECT v."id", 'https://play.pokemonshowdown.com/sprites/trainers/roark.png', 60, '{"teamSize":null,"maxLevel":null,"requiredTypes":[],"forbiddenTypes":[],"minPower":0}'::jsonb, 3000, 'butin-grotte', 3, '{"name":"Badge Charbon","image":null}'::jsonb, false, NULL, NULL, '{"type":"regionDexPercent","regionId":"sinnoh","percent":5}'::jsonb, 'pierrick', 'sinnoh', NULL, 0, 'Pierrick', 'Champion d’arène', '[{"speciesId":74,"level":22,"iv":null,"nature":null},{"speciesId":95,"level":23,"iv":null,"nature":null},{"speciesId":408,"level":26,"iv":null,"nature":null}]'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Paliers « 50 % » des nouvelles régions.
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "shiny", "percent", "rewards")
SELECT v."id", 'johto-50', 5, 'Chercheur de Johto', 'johto', false, 50, '{"currency":10000,"items":[{"itemId":"ultra-ball","quantity":10}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "shiny", "percent", "rewards")
SELECT v."id", 'hoenn-50', 6, 'Chercheur de Hoenn', 'hoenn', false, 50, '{"currency":20000,"items":[{"itemId":"ultra-ball","quantity":10}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "dex_milestones" ("content_version_id", "id", "order", "name", "region_id", "shiny", "percent", "rewards")
SELECT v."id", 'sinnoh-50', 7, 'Chercheur de Sinnoh', 'sinnoh', false, 50, '{"currency":30000,"items":[{"itemId":"ultra-ball","quantity":10}],"expeditionSlots":0,"battleSlots":0,"daycareSlots":0,"bonuses":[]}'::jsonb
FROM "content_versions" v
WHERE EXISTS (SELECT 1 FROM "regions" x WHERE x."content_version_id" = v."id" AND x."id" = 'kanto')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-route')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-mer')
  AND EXISTS (SELECT 1 FROM "loot_tables" x WHERE x."content_version_id" = v."id" AND x."id" = 'butin-grotte')
  AND EXISTS (SELECT 1 FROM "items" x WHERE x."content_version_id" = v."id" AND x."id" = 'ultra-ball')
ON CONFLICT DO NOTHING;
