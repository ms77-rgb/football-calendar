import BackgroundTasks
import SwiftUI

private let refreshTaskIdentifier = "de.ms77.FootballCalendarSync.refresh"

@main
struct FootballCalendarSyncApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .backgroundTask(.appRefresh(refreshTaskIdentifier)) {
            await BackgroundSync.run()
        }
    }
}

enum BackgroundSync {
    static func scheduleDaily() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: refreshTaskIdentifier)

        let request = BGAppRefreshTaskRequest(identifier: refreshTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 24 * 60 * 60)

        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // The app still performs a catch-up sync when opened again.
        }
    }

    static func cancel() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: refreshTaskIdentifier)
    }

    static func run() async {
        defer {
            if UserDefaults.standard.bool(forKey: "footballCalendarAutoSyncEnabled") {
                scheduleDaily()
            }
        }

        guard UserDefaults.standard.bool(forKey: "footballCalendarAutoSyncEnabled") else {
            return
        }

        guard
            let feed = UserDefaults.standard.string(forKey: "footballCalendarFeedURL"),
            let url = URL(string: feed),
            !feed.isEmpty,
            let calendarID = UserDefaults.standard.string(forKey: "footballCalendarTargetCalendarID"),
            !calendarID.isEmpty
        else {
            return
        }

        let service = await MainActor.run { CalendarSyncService() }
        await service.sync(feedURL: url, targetCalendarID: calendarID)
    }
}
