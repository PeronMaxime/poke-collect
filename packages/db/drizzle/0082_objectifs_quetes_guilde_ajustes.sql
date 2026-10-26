-- Objectifs des quêtes de guilde ajustés dans l'admin (jour et semaine), repris dans la version
-- publiée et les brouillons. Les quêtes déjà tirées gardent leur objectif jusqu'au tirage suivant.
UPDATE "guild_quests" q
SET "daily" = v."daily"::jsonb, "weekly" = v."weekly"::jsonb
FROM (VALUES
  ('captures', '{"countPerMember":150,"minCount":225}', '{"countPerMember":1000,"minCount":1500}'),
  ('captures-normal', '{"countPerMember":30,"minCount":45}', '{"countPerMember":210,"minCount":315}'),
  ('combats', '{"countPerMember":10,"minCount":15}', '{"countPerMember":70,"minCount":105}'),
  ('captures-eau', '{"countPerMember":30,"minCount":45}', '{"countPerMember":210,"minCount":315}'),
  ('captures-plante', '{"countPerMember":30,"minCount":45}', '{"countPerMember":210,"minCount":315}'),
  ('captures-feu', '{"countPerMember":24,"minCount":36}', '{"countPerMember":180,"minCount":270}'),
  ('argent', '{"countPerMember":50000,"minCount":75000}', '{"countPerMember":350000,"minCount":525000}'),
  ('donjons', '{"countPerMember":10,"minCount":15}', '{"countPerMember":70,"minCount":95}'),
  ('grande-chasse', '{"countPerMember":450,"minCount":675}', '{"countPerMember":3000,"minCount":4500}'),
  ('marathon', '{"countPerMember":100,"minCount":150}', '{"countPerMember":700,"minCount":1000}')
) AS v("id", "daily", "weekly"), "content_versions" cv
WHERE q."id" = v."id"
  AND cv."id" = q."content_version_id"
  AND cv."status" IN ('published', 'draft');
