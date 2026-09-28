# Football Calendar

Universal football calendar aggregator for combining team schedules from multiple sources into a single subscribable iCalendar feed.

## MVP goal

The first milestone proves the full data path:

1. connector fetches source events
2. events are normalized into one internal model
3. duplicates are resolved by source + source event id
4. a stable iCalendar feed is published
5. iPhone, Google Calendar and Outlook can subscribe to that feed

## Current status

Implemented:

- Next.js + TypeScript project foundation
- connector interface
- normalized calendar event model
- event deduplication
- ICS generator
- demo connector
- demo endpoint at `/api/calendar/demo`
- real FUSSBALL.DE import
- SpielerPlus HTML connector for authenticated event-list and detail pages
- developer endpoint at `/api/spielerplus/events` to validate parsed trainings/games

Not yet implemented:

- persistent database
- user accounts
- multi-user persistent feed configuration
- background synchronization
- automatic SpielerPlus session renewal

## Local development

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
http://localhost:3000/api/calendar/demo
```

The second URL returns a valid `.ics` response containing one demo match.

## Architecture

```text
FUSSBALL.DE ─────┐
                 ├── Connector layer ──> normalized events ──> ICS service
SpielerPlus ─────┘
                                               │
                                               └──> subscribed calendar clients
```

Each external platform is isolated behind a connector. The rest of the application only works with normalized `CalendarEvent` objects.

## Security principle

Private calendar URLs and authenticated sessions are treated like secrets. The SpielerPlus HTML connector accepts an existing session cookie from its caller, uses it only for server-side GET requests to `spielerplus.de`, and does not persist it. The current developer endpoint is for validation only; a subscribable production feed still needs secure per-user credential/session storage or another durable authorization mechanism.

## Next milestone

Validate the SpielerPlus HTML parser against several trainings and games, then add secure per-user session handling so SpielerPlus events can be merged into the same subscribable ICS feed as FUSSBALL.DE.


## Private combined feed MVP

The first private combined-feed endpoint is:

```text
/api/calendar/feed/<CALENDAR_FEED_TOKEN>?team=<FUSSBALL.DE team id>::<team name>
```

It combines the selected FUSSBALL.DE teams with the authenticated SpielerPlus
event feed.

Required server-side environment variables:

```text
CALENDAR_FEED_TOKEN=<long random secret>
SPIELERPLUS_COOKIE=<current SpielerPlus web session cookie>
```

Neither secret belongs in Git, logs, or screenshots. The feed token is intended
to be the secret subscription URL credential; the SpielerPlus cookie stays
server-side. This is intentionally a single-user MVP. A later milestone should
replace these environment variables with encrypted per-user storage and a
reconnect flow.
