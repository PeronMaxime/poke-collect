-- Plan de sécurité, S1 : le serveur n'envoie plus de notification qu'aux services push des
-- navigateurs (liste blanche de apps/api/src/game/push.ts). Les abonnements enregistrés vers une
-- autre adresse (réseau interne, site quelconque) sont supprimés.
DELETE FROM "push_subscriptions"
WHERE "endpoint" !~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)+push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)/';
