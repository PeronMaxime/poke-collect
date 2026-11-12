# `@poke/client` : le client HTTP de l'API

La fonction d'appel commune au jeu (`apps/web`) et à l'admin (`apps/admin`), sans dépendance :

- `createApi(options)` rend `api<T>(chemin, { json, ...fetch })` : JSON, cookie de session,
  délai maximal (20 s par défaut), et toute erreur en `ApiError` (code du serveur, `HTTP_<statut>`,
  ou `NETWORK` / `TIMEOUT` sans réponse) ;
- `shouldRetryQuery` et `retryDelay` : quand TanStack Query réessaie une lecture (erreurs
  passagères seulement, `Retry-After` respecté).

Chaque application crée son `api` dans son `lib/api.ts` et y ajoute ce qui lui est propre : le
jeu, l'en-tête du profil de l'onglet et le compteur de requêtes en développement ; l'admin, un
délai plus long (imports, publication, télémétrie).

```sh
pnpm --filter @poke/client test
```
