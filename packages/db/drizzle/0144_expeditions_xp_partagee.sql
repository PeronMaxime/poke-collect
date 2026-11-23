-- Expéditions : l'XP est partagée entre les membres de l'équipe (20 nov.).
-- Figé au départ : les expéditions déjà parties (false) donnent encore le total à chaque membre.
ALTER TABLE "expeditions" ADD COLUMN "xp_shared" boolean DEFAULT false NOT NULL;
