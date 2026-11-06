-- Tablettes des quêtes des trois colosses : sprites des Plaques d'Arceus (Plaque Roc, Plaque Fer,
-- Plaque Glace), qui ressemblent davantage à des tablettes. Toutes les versions de contenu ;
-- seulement si l'icône est encore celle d'origine (une icône changée dans l'admin est gardée).
UPDATE "items" SET "icon" = '/api/sprites/items/stone-plate.png'
WHERE "id" = 'tablette-de-roche' AND "icon" = '/api/sprites/items/hard-stone.png';
--> statement-breakpoint
UPDATE "items" SET "icon" = '/api/sprites/items/iron-plate.png'
WHERE "id" = 'tablette-d-acier' AND "icon" = '/api/sprites/items/metal-coat.png';
--> statement-breakpoint
UPDATE "items" SET "icon" = '/api/sprites/items/icicle-plate.png'
WHERE "id" = 'tablette-de-glace' AND "icon" = '/api/sprites/items/icy-rock.png';
