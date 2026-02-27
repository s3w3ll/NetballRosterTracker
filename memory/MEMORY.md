# NetballRosterTracker - Project Memory

## Overview
Netball court time tracker webapp. Team managers track player time on court/bench.
Built with Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, ShadCN UI.

## Key Architecture Facts
- **100% client-side app** - NO API routes, NO SSR, NO server actions anywhere
- Firebase is ONLY used for Auth + Firestore (database). App Hosting is separate concern.
- All data operations are direct client→Firestore via Firebase SDK
- Real-time subscriptions via `onSnapshot` (useDoc, useCollection hooks)
- Data model: `/users/{userId}/rosters|matches|tournaments|gameFormats|settings`

## Firebase Layer (src/firebase/)
- `config.ts` - hardcoded Firebase project keys (fallback)
- `index.ts` - `initializeFirebase()`: tries App Hosting env vars first, falls back to config
- `provider.tsx` - React context wrapping entire app, onAuthStateChanged listener
- `firestore/use-doc.tsx` - hook for single doc real-time subscription
- `firestore/use-collection.tsx` - hook for collection/query real-time subscription
- `non-blocking-login.tsx` - anonymous + email/password auth functions
- Auth currently: anonymous auto-sign-in on load (Header.tsx), + email/password

## Deployment Situation
- Currently configured for Firebase App Hosting (managed Next.js host)
- `initializeFirebase()` tries `initializeApp()` with NO args (App Hosting env vars)
- Since app has no API routes/SSR, it CAN be statically exported (`output: 'export'`)
- Firebase SDK is just a JS library - works from any host
- next.config.ts has `ignoreBuildErrors: true` and `ignoreDuringBuilds: true`

## Key Pages/Routes
- `/` - Dashboard
- `/rosters`, `/rosters/new`, `/rosters/[rosterId]` - Roster CRUD
- `/games`, `/games/new`, `/games/new/[rosterId]`, `/games/[gameId]` - Games
- `/plans`, `/plans/new`, `/plans/new/[rosterId]` - Match plans
- `/tournaments`, `/tournaments/new`, `/tournaments/[tournamentId]` - Tournaments

## User Preferences
- Wants to be less reliant on Firebase specifically
- Interested in: self-hosting, Digital Ocean Droplet, GitHub Pages
- Wants simpler/cheaper backend for basic hosting

## Migration Options Evaluated
See architecture-analysis.md for full details.
Recommended short-term: static export + keep Firebase (zero code changes)
Recommended long-term: PocketBase on DO Droplet (replaces Firebase entirely)
