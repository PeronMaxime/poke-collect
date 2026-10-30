-- Dresseurs plus difficiles, versions publiée et brouillon : +1 à +8 niveaux selon le palier d'arène
-- (dresseurs répétables + champion suivant), +10 pour le Conseil 4 et les dresseurs légendaires,
-- +12 pour le Maître de la Ligue. Ajout relatif, pour garder les équipes retouchées dans l'admin.
UPDATE "trainers" t
SET "team" = (
  SELECT jsonb_agg(jsonb_set(e.member, '{level}', to_jsonb(LEAST((e.member->>'level')::integer + b.bonus, 100))) ORDER BY e.position)
  FROM jsonb_array_elements(t."team") WITH ORDINALITY AS e(member, position)
)
FROM "content_versions" cv, (VALUES
  ('gamin-tom', 1), ('fillette-lise', 1), ('scout-rick', 1), ('pierre', 1), ('gamin-joey', 1), ('scout-willy', 1),
  ('sage-li', 1), ('albert', 1), ('gamin-calvin', 1), ('scout-arthur', 1), ('sbire-aqua-clementi', 1), ('roxanne', 1),
  ('gamin-unys', 1), ('aloe', 1), ('pierrick', 1), ('violette', 1), ('katy', 1), ('percy', 1),
  ('ilima', 1), ('nouvel', 1), ('touriste-maya', 1), ('campeur-leo', 2), ('intello-miguel', 2), ('pique-niqueuse-ali', 2),
  ('ondine', 2), ('pecheur-raoul', 2), ('montagnard-anthony', 2), ('sbire-puits', 2), ('hector', 2), ('campeur-jose', 2),
  ('montagnard-bruno', 2), ('sbire-magma-poivressel', 2), ('bastien', 2), ('cornelia', 2), ('marin-hugo', 3), ('major-bob', 3),
  ('scout-hugo', 3), ('pique-niqueuse-gina', 3), ('blanche', 3), ('cycliste-ludo', 3), ('pique-niqueuse-lina', 3), ('voltere', 3),
  ('montagnard-ivan', 4), ('erika', 4), ('mediume-edith', 4), ('mortimer', 4), ('sbire-magma-chimnee', 4), ('adriane', 4),
  ('mediume-paula', 5), ('motard-rex', 5), ('koga', 5), ('nageuse-marina', 5), ('chuck', 5), ('nageuse-maeva', 5),
  ('norman', 5), ('karateka-kiyo', 6), ('sbire-rocket', 6), ('morgane', 6), ('marin-gilles', 6), ('jasmine', 6),
  ('ornithologue-elie', 6), ('alizee', 6), ('nageuse-lena', 7), ('auguste', 7), ('sbire-qg-rocket', 7), ('fredo', 7),
  ('sbire-aqua-memoria', 7), ('levy-tatia', 7), ('scientifique-hector', 8), ('giovanni', 8), ('topdresseuse-alice', 8), ('skieuse-rosa', 8),
  ('sandra', 8), ('topdresseur-gaston', 8), ('pecheur-tomas', 8), ('juan', 8), ('topdresseuse-vanessa', 8), ('olga', 10),
  ('aldo', 10), ('agatha', 10), ('peter', 10), ('clement', 10), ('koga-conseil', 10), ('aldo-johto', 10),
  ('marion', 10), ('damien', 10), ('spectra', 10), ('glacia', 10), ('aragon', 10), ('red', 10),
  ('pierre-rochard', 10), ('maitre-blue', 12), ('maitre-peter', 12), ('maitre-marc', 12), ('tarak', 12)
) AS b(id, bonus)
WHERE cv."id" = t."content_version_id" AND cv."status" IN ('published', 'draft') AND t."id" = b.id;
