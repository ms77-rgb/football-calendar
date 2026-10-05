# Football Calendar Sync for iPhone

Native SwiftUI companion app for synchronizing the private Football Calendar feed into a dedicated writable iPhone calendar.

## What it does

- Reads the existing private ICS feed.
- Creates/uses a dedicated calendar named **Fußball + SpielerPlus**.
- Stores the stable feed UID in each imported event's notes as `football-calendar-id:<UID>`.
- Creates new events.
- Updates changed events.
- Skips unchanged events, so re-syncing does not create duplicates.
- Removes previously imported events when they no longer exist in the feed.
- Never deletes unrelated events outside the dedicated calendar.

## Create the Xcode project

1. Open Xcode on a Mac.
2. Choose **File > New > Project > iOS > App**.
3. Product Name: `FootballCalendarSync`.
4. Interface: **SwiftUI**. Language: **Swift**.
5. Set the deployment target to **iOS 17** or newer.
6. Replace the generated Swift files with the files in `ios/FootballCalendarSync/`.
7. In the target's **Info** settings, add:
   - `Privacy - Calendars Full Access Usage Description`
   - Value: `Football Sync benötigt Kalenderzugriff, um Fußballtermine zu erstellen, zu aktualisieren und zu entfernen.`
8. Select your Apple Development Team under **Signing & Capabilities**.
9. Connect the iPhone and run the app.

## First sync

Paste the complete private Football Calendar feed URL into the app. The URL contains a secret feed token and should not be shared.

Tap **Jetzt synchronisieren** and grant calendar access. The app creates the dedicated calendar and performs a full reconciliation.

## Important behavior

The app only deletes events that:
- are inside the dedicated **Fußball + SpielerPlus** calendar, and
- contain the app's own `football-calendar-id:` marker.

This makes deletion and duplicate prevention deterministic for future sync runs.
