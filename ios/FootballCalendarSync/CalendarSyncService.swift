import Combine
import EventKit
import Foundation

struct SyncResult {
    let created: Int
    let updated: Int
    let deleted: Int
    let unchanged: Int
}

@MainActor
final class CalendarSyncService: ObservableObject {
    private let eventStore = EKEventStore()
    private let calendarName = "Fußball + SpielerPlus"
    private let markerPrefix = "football-calendar-id:"

    @Published var isRunning = false
    @Published var status = "Noch nicht synchronisiert"

    func requestAccess() async throws {
        if #available(iOS 17.0, *) {
            _ = try await eventStore.requestFullAccessToEvents()
        } else {
            _ = try await withCheckedThrowingContinuation { continuation in
                eventStore.requestAccess(to: .event) { granted, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: granted)
                    }
                }
            } as Bool
        }
    }

    func sync(feedURL: URL) async {
        isRunning = true
        defer { isRunning = false }

        do {
            try await requestAccess()
            let remoteEvents = try await FeedParser().load(from: feedURL)
            let result = try reconcile(remoteEvents: remoteEvents)
            status = "Fertig: \(result.created) neu, \(result.updated) geändert, \(result.deleted) gelöscht, \(result.unchanged) unverändert."
        } catch {
            status = error.localizedDescription
        }
    }

    private func reconcile(remoteEvents: [RemoteCalendarEvent]) throws -> SyncResult {
        let calendar = try getOrCreateCalendar()

        let calendarStart = Calendar.current.date(byAdding: .year, value: -1, to: Date())!
        let calendarEnd = Calendar.current.date(byAdding: .year, value: 3, to: Date())!
        let predicate = eventStore.predicateForEvents(
            withStart: calendarStart,
            end: calendarEnd,
            calendars: [calendar]
        )
        let existingEvents = eventStore.events(matching: predicate)

        var existingByRemoteID: [String: EKEvent] = [:]
        for event in existingEvents {
            if let id = remoteID(from: event.notes) {
                existingByRemoteID[id] = event
            }
        }

        var created = 0
        var updated = 0
        var deleted = 0
        var unchanged = 0
        let remoteIDs = Set(remoteEvents.map(\.id))

        for remote in remoteEvents {
            if let existing = existingByRemoteID[remote.id] {
                if apply(remote, to: existing) {
                    try eventStore.save(existing, span: .thisEvent, commit: false)
                    updated += 1
                } else {
                    unchanged += 1
                }
            } else {
                let event = EKEvent(eventStore: eventStore)
                event.calendar = calendar
                apply(remote, to: event)
                try eventStore.save(event, span: .thisEvent, commit: false)
                created += 1
            }
        }

        for existing in existingEvents {
            guard
                let remoteID = remoteID(from: existing.notes),
                !remoteIDs.contains(remoteID)
            else {
                continue
            }

            try eventStore.remove(existing, span: .thisEvent, commit: false)
            deleted += 1
        }

        if created + updated + deleted > 0 {
            try eventStore.commit()
        }

        return SyncResult(
            created: created,
            updated: updated,
            deleted: deleted,
            unchanged: unchanged
        )
    }

    @discardableResult
    private func apply(_ remote: RemoteCalendarEvent, to event: EKEvent) -> Bool {
        let oldSnapshot = snapshot(event)

        event.title = remote.title
        event.startDate = remote.start
        event.endDate = remote.end
        event.location = remote.location
        event.url = remote.url

        let userNotes = remote.notes?.trimmingCharacters(in: .whitespacesAndNewlines)
        let marker = "\(markerPrefix)\(remote.id)"
        event.notes = [userNotes, marker]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")

        return oldSnapshot != snapshot(event)
    }

    private func snapshot(_ event: EKEvent) -> String {
        [
            event.title ?? "",
            event.startDate?.timeIntervalSince1970.description ?? "",
            event.endDate?.timeIntervalSince1970.description ?? "",
            event.location ?? "",
            event.url?.absoluteString ?? "",
            event.notes ?? ""
        ].joined(separator: "|")
    }

    private func remoteID(from notes: String?) -> String? {
        guard let notes else { return nil }

        return notes
            .components(separatedBy: .newlines)
            .first(where: { $0.hasPrefix(markerPrefix) })
            .map { String($0.dropFirst(markerPrefix.count)) }
    }

    private func getOrCreateCalendar() throws -> EKCalendar {
        if let existing = eventStore.calendars(for: .event).first(where: { $0.title == calendarName }) {
            return existing
        }

        let calendar = EKCalendar(for: .event, eventStore: eventStore)
        calendar.title = calendarName

        if let iCloud = eventStore.sources.first(where: { $0.sourceType == .calDAV && $0.title.localizedCaseInsensitiveContains("icloud") }) {
            calendar.source = iCloud
        } else if let local = eventStore.sources.first(where: { $0.sourceType == .local }) {
            calendar.source = local
        } else if let source = eventStore.defaultCalendarForNewEvents?.source {
            calendar.source = source
        } else {
            throw NSError(
                domain: "FootballCalendarSync",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Es wurde kein beschreibbarer Kalender gefunden."]
            )
        }

        try eventStore.saveCalendar(calendar, commit: true)
        return calendar
    }
}
