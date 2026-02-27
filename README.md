# Netball Court Time Tracker

A web app for netball coaches and managers to track player court time, plan match lineups, and manage team rosters. Built to solve the common problem of losing track of substitutions and ensuring fair playing time across a squad.

**Live site:** [netball.forgesync.co.nz](https://netball.forgesync.co.nz)

## Features

### Roster Management
Create and manage team rosters with player lists that can be reused across games and match plans.

### Live Game Tracker
Run a live game with a game clock, period tracking, and drag-and-drop player placement on court positions. Tracks time on court and time per position for every player in real time.

### Match Planner
Pre-plan lineups for each period before a game. Drag players into positions across all periods and see cumulative time-per-position totals to help balance playing time.

### Tournaments
Group multiple matches into a tournament to view aggregated player statistics across an event.

## Tech Stack

- **Framework:** Next.js 15 (App Router) with static export for GitHub Pages
- **Backend:** Firebase (Firestore + Authentication) — all client-side
- **Styling:** Tailwind CSS + shadcn/ui components
- **Hosting:** GitHub Pages with GitHub Actions CI/CD

## Getting Started

### Prerequisites
- Node.js 20+
- A Firebase project (Firestore + Auth enabled)

### Local Development

1. Clone the repo:
   ```bash
   git clone https://github.com/s3w3ll/NetballRosterTracker.git
   cd NetballRosterTracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file with your Firebase config:
   ```
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:9002](http://localhost:9002)

### Production Build

```bash
npm run build
```

Static output is generated in the `out/` directory, ready for GitHub Pages or any static hosting.

## Deployment

The app deploys automatically to GitHub Pages on push to `main` via GitHub Actions. Firebase config values are injected from repository secrets during the build step.
