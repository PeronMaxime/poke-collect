-- Sprites des badges d'arène (apps/web/public/badges, repris de PokeAPI/sprites) : seulement pour
-- les badges sans image, pour ne pas écraser celles choisies dans l'admin.
UPDATE "trainers" AS t
SET "badge" = jsonb_set(t."badge", '{image}', to_jsonb(v."image"))
FROM (VALUES
  ('pierre', '/badges/1.png'),
  ('ondine', '/badges/2.png'),
  ('major-bob', '/badges/3.png'),
  ('erika', '/badges/4.png'),
  ('koga', '/badges/5.png'),
  ('morgane', '/badges/6.png'),
  ('auguste', '/badges/7.png'),
  ('giovanni', '/badges/8.png'),
  ('albert', '/badges/9.png'),
  ('hector', '/badges/10.png'),
  ('blanche', '/badges/11.png'),
  ('mortimer', '/badges/12.png'),
  ('chuck', '/badges/13.png'),
  ('jasmine', '/badges/14.png'),
  ('fredo', '/badges/15.png'),
  ('sandra', '/badges/16.png'),
  ('roxanne', '/badges/17.png'),
  ('bastien', '/badges/18.png'),
  ('voltere', '/badges/19.png'),
  ('adriane', '/badges/20.png'),
  ('norman', '/badges/21.png'),
  ('alizee', '/badges/22.png'),
  ('levy-tatia', '/badges/23.png'),
  ('juan', '/badges/24.png'),
  ('pierrick', '/badges/25.png'),
  ('aloe', '/badges/34.png'),
  ('violette', '/badges/43.png'),
  ('cornelia', '/badges/45.png'),
  ('percy', '/badges/51.png'),
  ('katy', '/badges/70.png')
) AS v("id", "image")
WHERE t."id" = v."id" AND t."badge" IS NOT NULL AND t."badge"->>'image' IS NULL;
