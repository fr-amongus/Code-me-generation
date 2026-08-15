# Code Me Generation

Code Me Generation transforme une description en langage naturel en une application web autonome générée par Gemini, puis l'affiche immédiatement dans un aperçu isolé.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/code-me-generation/src/pages/home.tsx` — atelier principal, saisie du brief, états de génération, iframe et code source.
- `artifacts/code-me-generation/src/index.css` — thème visuel sombre, tokens de couleur et animations.
- `artifacts/api-server/src/routes/generate.ts` — génération Gemini et prompt système HTML-only.
- `lib/api-spec/openapi.yaml` — contrat source de `POST /api/generate`.
- `lib/api-client-react/src/generated/` et `lib/api-zod/src/generated/` — clients générés depuis OpenAPI.

## Architecture decisions

- Le frontend passe par le client généré OpenAPI afin que la validation du brief et la réponse HTML restent alignées entre client et serveur.
- Chaque résultat Gemini est rendu via `iframe.srcDoc` avec un sandbox limité, sans écrire le code généré dans le DOM de l'application.
- Le backend utilise l'API officielle `@google/genai` et conserve la clé uniquement dans `GEMINI_API_KEY`.
- Le modèle de génération est `gemini-3-flash-preview`, car les modèles Gemini 1.5/2.5 sont indisponibles pour les nouvelles clés utilisées ici.

## Product

- Décrire une idée d'application en français ou en langage naturel.
- Générer un fichier autonome HTML/CSS/JavaScript avec Gemini.
- Visualiser le résultat en live dans un aperçu isolé.
- Lire, copier et réinitialiser le code source généré.
- Recevoir un message explicite en cas de brief invalide, quota Gemini ou erreur serveur.

## User preferences

- L'interface doit être moderne, sombre, épurée, très responsive et inspirée de Replit.

## Gotchas

- Après toute modification d'OpenAPI, relancer `pnpm --filter @workspace/api-spec run codegen`.
- Pour un build Vite manuel, fournir `PORT` et `BASE_PATH`; le workflow les injecte automatiquement.
- Les apps générées sont du HTML autonome et sont volontairement isolées dans l'iframe.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
