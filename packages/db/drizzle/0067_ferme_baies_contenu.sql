-- Ferme à baies : la Baie Framby se plante (pousse 1 h tant que le champ est arrosé, donne 1 à 3
-- baies). Ajouté à toutes les versions de contenu, sans toucher aux autres effets de l'objet.
UPDATE "items"
SET "effects" = "effects" || '[{"type":"berryPlant","minutes":60,"minYield":1,"maxYield":3}]'::jsonb
WHERE "id" = 'razz-berry' AND NOT "effects" @> '[{"type":"berryPlant"}]'::jsonb;
