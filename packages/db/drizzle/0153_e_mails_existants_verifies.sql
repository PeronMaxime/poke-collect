-- Plan de sécurité, 2.2 : la vérification de l'e-mail ne concerne que les nouveaux comptes.
-- Les comptes déjà créés gardent l'accès, comme s'ils avaient confirmé leur adresse.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
