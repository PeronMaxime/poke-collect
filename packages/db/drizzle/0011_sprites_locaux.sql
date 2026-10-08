-- Sprites de dresseurs servis par l'API (apps/api/sprites) au lieu de Pokémon Showdown.
-- Trois noms inexistants chez Showdown sont corrigés au passage (Olga, Agatha, Gamin d'Unys).
UPDATE "trainers"
SET "sprite" = '/api/sprites/trainers/' || CASE substring("sprite" FROM '/trainers/([a-z0-9-]+)\.png$')
  WHEN 'lorelei' THEN 'lorelei-gen3'
  WHEN 'agatha' THEN 'agatha-gen3'
  WHEN 'youngster-gen5' THEN 'youngster'
  ELSE substring("sprite" FROM '/trainers/([a-z0-9-]+)\.png$')
END || '.png'
WHERE substring("sprite" FROM '^https://play\.pokemonshowdown\.com/sprites/trainers/([a-z0-9-]+)\.png$') IN (
  'agatha', 'agatha-gen3', 'blue', 'brock', 'bruno', 'bugcatcher', 'camper', 'falkner',
  'hiker-gen3', 'ilima', 'katy', 'korrina', 'lance', 'lass', 'lass-gen4', 'lenora', 'leon',
  'lorelei', 'lorelei-gen3', 'milo', 'misty', 'roark', 'roxanne', 'viola', 'youngster',
  'youngster-gen4', 'youngster-gen5'
);
