-- Baie Sitrus : une fois toutes les 10 s en combat (recharge ajoutée aux effets de soin qui n'en
-- ont pas encore, dans toutes les versions de contenu).
UPDATE "items" i
SET "effects" = (
  SELECT jsonb_agg(
    CASE
      WHEN e->>'type' = 'battleHeal' AND NOT e ? 'cooldownSeconds'
      THEN e || '{"cooldownSeconds":10}'::jsonb
      ELSE e
    END ORDER BY o)
  FROM jsonb_array_elements(i."effects") WITH ORDINALITY AS t(e, o)
)
WHERE i."effects" @> '[{"type":"battleHeal"}]'::jsonb;
