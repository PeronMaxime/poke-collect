-- Les objets de quête sont désormais rendus quand on réclame la quête. On retire des sacs ceux
-- qui ne servent plus à rien : un objet demandé par une étape « objet de quête » du contenu
-- publié, dont le joueur a réclamé toutes les quêtes qui le demandent. S'il reste une quête non
-- réclamée (ou à refaire) qui le demande, le joueur le garde.
WITH quest_items AS (
  SELECT DISTINCT q.id AS quest_id, s->'condition'->>'itemId' AS item_id
  FROM "quests" q
  JOIN "content_versions" v ON v.id = q.content_version_id AND v.status = 'published'
  CROSS JOIN LATERAL jsonb_array_elements(q.steps) AS s
  WHERE s->'condition'->>'type' = 'questItem'
)
DELETE FROM "inventory" i
WHERE i.item_id IN (SELECT item_id FROM quest_items)
  AND NOT EXISTS (
    SELECT 1 FROM quest_items qi
    LEFT JOIN "quest_progress" p ON p.owner_id = i.owner_id AND p.quest_id = qi.quest_id
    WHERE qi.item_id = i.item_id AND p.claimed_at IS NULL
  );
