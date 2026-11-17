# Tasks

## Active

- [ ] **PWA support** - Offline mode, installable app for venues with poor connectivity
- [ ] **Export tournament report** - Image or PDF showing all games with per-player positions by quarter
- [ ] **Collaborative planning** - Share match plans with assistant coaches

## Waiting On

## Someday

### Up Next
- [ ] **Player availability** - Mark a player away/unavailable for a specific game so they're excluded from auto-scheduling and manual plans

### Planned Features
- [ ] **Player position preferences** - Flag preferred positions per player in roster; used by the scheduler
- [ ] **Import rosters from CSV** - Bulk import player lists instead of manual entry
- [ ] **Match history timeline** - View all past games for a roster in chronological order
- [ ] **Undo/redo for match plan editing** - Step backwards/forwards through plan changes
- [ ] **Customizable game formats** - Create formats beyond 7-aside and 6-aside (custom period counts and durations)
- [ ] **Multi-tournament seasons** - Group tournaments into seasonal leaderboards

### Under Consideration
- [ ] **Automatic period advancement** - Timer auto-advances to next period at 0:00
- [ ] **Injury tracking** - Mark players unavailable with return dates (broader than per-game availability)
- [ ] **Live match sharing** - QR code for parents/spectators to view real-time stats
- [ ] **Team analytics** - Heatmaps showing position coverage over time
- [ ] **Roster comparison** - Suggest substitutions based on historical performance
- [ ] **Integration with league management systems** - Export to common formats
- [ ] **Real-time sync** - Live collaboration during match planning
- [ ] **Multi-team support** - Coach multiple teams from one account
- [ ] **Mobile apps** - Native iOS/Android for better offline support

### Game Format Coverage (Christchurch Netball / futureFERNS research, Aug 2026)

Research into [Christchurch Netball Centre](https://www.netballchristchurch.org.nz/) grades and Netball NZ's [Woolworths futureFERNS](https://futureferns.co.nz/) age-group pathway. The `game_formats`/`positions` schema is already generic (teamSize, numberOfPeriods, periodDuration, positions with optional `positionGroup` for zone-equity scheduling — see `worker/schema.sql`), so most of these are new **presets**, not schema changes. Regular-season formats are listed first; tournament-structure gaps (which don't depend on age/format) are separate below.

- [ ] **Year 1-2 preset (4 v 4, "free play")** - One-third court, no fixed positions, no score kept, 2.1m hoop, small grip ball. Doesn't map cleanly onto the position-tracking model (no positions, no scoring) — needs a design decision: either a minimal "no positions" format (bench-only rotation tracking) or explicitly skip this grade as out of scope. Source: [futureFERNS Year 1&2](https://futureferns.co.nz/file/5a7f1a8c23a11dd6dcbf23c9ad421ee6.html)
- [ ] **Year 3-4 preset (5 v 5)** - Two-thirds court, positions: Attack ×2, Centre ×1, Defence ×2 (`A1`/`A2`/`C`/`D1`/`D2`), 2.6m hoop, 4×8min quarters. Uneven `positionGroup` sizes (A/D pairs but a singleton C) — verify scheduler's zone-equity logic in `worker/src/lib/scheduler.ts` handles a group of 1 gracefully (existing tests only cover 6-a-side pairs and 7-a-side no-grouping). Source: [futureFERNS Year 3&4](https://tauranganetball.co.nz/media/1111/futureferns-year-3-and-4.pdf)
- [ ] **Confirm/rename existing "Fast 6-a-side" default as the Year 5-6 preset (6 v 6)** - Already matches CNC's Year 5/6 format: `A1/A2/C1/C2/D1/D2`, 4×8min quarters, 2.6m hoop. Consider renaming the seed in `src/app/games/new/configure/client.tsx` to "Year 5-6 (futureFERNS)" so it's discoverable by grade name, and note NZ Netball has [confirmed format changes for 2027](https://www.netballnz.co.nz/netball-nz/news/futureferns-year-5-6-format-changes-confirmed-for-2027.html) worth re-checking before next season.
- [ ] **Year 7-8 preset (7 v 7, 4×10min)** - Full court, standard GS/GA/WA/C/WD/GD/GK positions (same as existing "Standard 7-a-side" default) but shorter 10-minute quarters instead of 15, plus the futureFERNS requirement that every player gets "at least half a game" — worth a scheduler/validation check (warn if a plan gives any player <50% court time). Source: [futureFERNS Year 7&8](https://tauranganetball.co.nz/media/1113/futureferns-year-7-and-8.pdf)
- [ ] **Secondary Schools / Senior / Premier preset variants** - Same 7-a-side full-court format as adults, but grades vary quarter length in practice (e.g. Premier indoor vs. Saturday Premier 2, Senior 1/2, Challenge 1/2). Add a couple of named presets (e.g. "Secondary Schools (4×15)") rather than relying on users to hand-edit periods each time. Source: [Christchurch Netball - Where to start](https://www.netballchristchurch.org.nz/Playing-1/Where-to-start)
- [ ] **Fast5 preset (5 v 5)** - Positions GS/GA/C/GD/GK (WA and WD dropped), 4×6min quarters, unlimited rolling substitutions (no stoppage) — this actually fits the app's model *better* than standard netball since there's no substitution limit to enforce. Note: power-play double-scoring and the 2-point outer-circle zone are scoreboard concepts this app doesn't track (no goals-scored field in schema) and can be left out of scope; only team size/positions/timing need modelling. Source: [Fast5 Netball - Wikipedia](https://en.wikipedia.org/wiki/Fast5_netball)
- [ ] **Masters / Open / Mixed grade metadata** - Structurally identical 7-a-side format; the only gap is labeling (grade name on a roster/match) rather than a new game format — low priority, bundle with any future "grade/division" tagging feature.

### Tournament-Specific Features (separate from regular-season game formats)

Tournaments (e.g. CNC's Jellybean, Kings Birthday, Year 9, or U16 Tupuranga tournaments) are pool-play-then-finals events layered on top of whichever age format's games are being played — the gap is tournament *structure*, not player format:

- [ ] **Round-robin pool draw generator** - Given a list of teams + number of pools, generate a fair round-robin draw (courts/time slots already handled by `worker/src/lib/scheduler.ts` for court-time equity within a game; this is the higher-level "which teams play which teams, in what order" draw).
- [ ] **Points table / ladder** - Standard NZ netball tournament scoring: 4 pts win, 2 pts draw, 1 pt for a loss by ≤3 goals ("bonus point"), 0 for a heavier loss. Needs a goals-for/against field somewhere (currently out of scope per schema) or an explicit W/D/L + margin input per match.
- [ ] **Tie-break resolution** - When teams are level on points after pool play: head-to-head result first, then goal ratio/differential. Surface this on the tournament standings view.
- [ ] **Crossover / knockout finals bracket** - Auto-generate semis/final from final pool standings (e.g. 1st pool A vs 2nd pool B) once pool play tasks above exist.
- [ ] **Multi-day tournament support** - Some CNC tournaments run pools on day 1 and finals on day 2 (e.g. Kings Birthday, U16 Tupuranga); tournaments currently assume a single day/venue session — confirm `tournaments` schema and UI can span dates.

## Done
