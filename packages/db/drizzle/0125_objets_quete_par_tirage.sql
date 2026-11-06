-- Objets de quête : tirés à chaque tirage de butin (un toutes les 6 min) et non plus à chaque
-- rencontre, aux chances d'origine (3 à 6 %). Une version précédente de cette migration, passée
-- seulement sur des bases de développement, les avait doublées : on remet la chance d'origine là
-- où elle vaut exactement le double (ailleurs, rien ne change). Toutes les versions de contenu.
UPDATE "quests" SET "steps" = (
  SELECT jsonb_agg(
    CASE WHEN t.s->'condition'->>'type' = 'questItem'
      AND (t.s->'condition'->>'chance')::numeric = o.chance * 2
      THEN jsonb_set(t.s, '{condition,chance}', to_jsonb(o.chance))
      ELSE t.s END
    ORDER BY t.i)
  FROM jsonb_array_elements("quests"."steps") WITH ORDINALITY AS t(s, i)
  LEFT JOIN (VALUES
  ('fragment-magnetique', 4),
  ('plume-foudre', 6),
  ('eclat-de-givre', 4),
  ('cendre-ardente', 5),
  ('page-du-journal', 4),
  ('echantillon-adn', 4),
  ('vieille-carte-marine', 3),
  ('poil-soyeux', 3),
  ('plume-psychique', 4),
  ('plume-martiale', 4),
  ('plume-sombre', 4),
  ('eclat-de-tonnerre', 6),
  ('braise-eternelle', 6),
  ('eau-purifiee', 6),
  ('clochette-oceane', 4),
  ('argentaile', 5),
  ('arcenciaile', 5),
  ('statuette-de-l-autel', 3),
  ('rosee-du-voile-rouge', 4),
  ('ticket-eon', 5),
  ('tablette-de-roche', 4),
  ('tablette-d-acier', 5),
  ('tablette-de-glace', 5),
  ('orbe-bleu', 3),
  ('orbe-rouge', 4),
  ('orbe-de-jade', 4),
  ('poussiere-d-etoile', 4),
  ('fragment-de-meteorite', 3),
  ('cristal-aurore', 4)
  ) AS o(item_id, chance) ON o.item_id = t.s->'condition'->>'itemId'
)
WHERE "steps" @> '[{"condition":{"type":"questItem"}}]';
