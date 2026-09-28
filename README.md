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
- connector boundaries for FUSSBALL.DE and SpielerPlus

Not yet implemented:

- persistent database
- user accounts
- real FUSSBALL.DE import
- SpielerPlus ICS parsing
- background synchronization
- production feed tokens

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

Private calendar URLs are treated like secrets. The planned SpielerPlus integration does not require storing a user's SpielerPlus username or password.

## Next milestone

Implement SpielerPlus ICS ingestion first, because it gives us a clean end-to-end integration without storing account credentials. After that, validate and implement the production-safe FUSSBALL.DE access path.
