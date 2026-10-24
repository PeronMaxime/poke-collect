-- Talents de la ferme à baies : Récolte donne une baie de plus par parcelle récoltée (assistant de
-- récolte), Moiteur fait pousser les baies 25 % plus vite (assistant qui arrose). Effet ajouté en
-- fin de liste, seulement s'il n'y est pas déjà (toutes les versions de contenu).
UPDATE "abilities" a
SET "effects" = a."effects" || n."effect"::jsonb
FROM (VALUES
  ('harvest', 'berryYield', '[{"type":"modifier","param":"berryYield","value":1,"scope":"team","conditions":[]}]'),
  ('damp', 'berryGrowth', '[{"type":"modifier","param":"berryGrowth","value":25,"scope":"team","conditions":[]}]')
) AS n("id", "param", "effect")
WHERE a."id" = n."id"
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(a."effects") AS e
    WHERE e->>'type' = 'modifier' AND e->>'param' = n."param"
  );
