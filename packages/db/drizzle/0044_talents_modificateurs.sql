ALTER TABLE "expeditions" ADD COLUMN "local_hour" smallint;--> statement-breakpoint
ALTER TABLE "trainer_battles" ADD COLUMN "local_hour" smallint;--> statement-breakpoint
-- Talents : les 4 anciens effets (PE, capture, XP, argent) deviennent des modificateurs.
UPDATE "abilities" SET "effects" = (
  SELECT coalesce(jsonb_agg(CASE WHEN e->>'type' IN ('power', 'capture', 'xp', 'money') THEN jsonb_build_object('type', 'modifier', 'param', e->>'type', 'value', e->'percent', 'scope', CASE WHEN e->>'type' = 'power' THEN 'self' ELSE 'team' END, 'conditions', '[]'::jsonb) ELSE e END ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements("effects") WITH ORDINALITY AS t(e, ord)
) WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("effects") AS x(e) WHERE e->>'type' IN ('power', 'capture', 'xp', 'money'));
