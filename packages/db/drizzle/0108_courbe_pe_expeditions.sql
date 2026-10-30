-- Nouvelle courbe de PE minimale des zones, calée sur le niveau des Champions, versions publiée et
-- brouillon. Seules les valeurs d'origine sont converties : une zone réglée sur une autre valeur
-- dans l'admin ne bouge pas. Le butin, déjà en base, ne change pas. Même table que les seeds.
UPDATE "zones" z
SET "min_power" = v."new_power"
FROM "content_versions" cv,
  (VALUES
    (100, 170), (180, 300), (250, 450), (300, 500), (380, 700), (400, 750), (420, 800),
    (480, 950), (520, 1000), (560, 1050), (600, 1150), (700, 1400), (800, 1650), (850, 1725),
    (900, 1800), (1000, 1850), (1200, 1900), (1300, 1950), (1400, 2025), (1500, 2100),
    (1800, 2500), (2000, 2750), (2400, 3150), (2500, 3200), (2600, 3250), (2800, 3350),
    (3000, 3500), (3200, 3600), (3600, 3650)
  ) AS v("old_power", "new_power")
WHERE cv."id" = z."content_version_id" AND cv."status" IN ('published', 'draft') AND z."min_power" = v."old_power";
