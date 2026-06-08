# apps/web — Next.js APM Trainer + Analyzer Dashboard

This workspace member is a placeholder. The Next.js application will be
scaffolded in EPIC 6 (T6.1+) once the data layer (EPIC 1–3) is in place.

## Planned stack
- Next.js (App Router)
- React
- PixiJS / Canvas (APM trainer drills, game-feel layer — T4.5)
- Recharts / D3 (replay timeline, benchmark charts — T6.2)
- WC3-themed design system (T6.1)

## Why not scaffold Next.js now?
T0.1 is about establishing the monorepo skeleton. Running `create-next-app`
at this stage would pull in a heavy dependency tree before we know which
features each page needs. The web app is scaffolded properly in T6.1.

## When ready
Replace this placeholder with:
```
corepack pnpm create next-app . --typescript --app --tailwind --eslint --src-dir
```
Then wire `tsconfig.json` to extend `../../tsconfig.base.json` and add
`@wc3-coach/shared-types` as a workspace dependency.
