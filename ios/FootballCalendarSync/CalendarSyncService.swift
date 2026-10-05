import Combine
import EventKit
import Foundation

struct CalendarChoice: Identifiable, Hashable {
    let id: String
    let title: String
    let sourceTitle: String
}

struct SyncResult {
    let created: Int
    let adopted: Int
    let updated: Int
    let deleted: Int
    let unchanged: Int
}

@MainActor
final class CalendarSyncService: ObservableObject {
    private let eventStore = EKEventStore()
    private let markerPrefix = "football-calendar-id:"

    @Published var isRunning = false
    @Published var status = "Noch nicht synchronisiert"
    @Published var calendars: [CalendarChoice] = []

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

    func loadCalendars() async {
        do {
            try await requestAccess()

            calendars = eventStore.calendars(for: .event)
                .filter { $0.allowsContentModifications }
                .map {
                    CalendarChoice(
                        id: $0.calendarIdentifier,
                        title: $0.title,
                        sourceTitle: $0.source.title
                    )
                }
                .sorted {
                    if $0.sourceTitle == $1.sourceTitle {
                        return $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending
                    }
                    return $0.sourceTitle.localizedCaseInsensitiveCompare($1.sourceTitle) == .orderedAscending
                }
        } catch {
            status = error.localizedDescription
        }
    }

    func sync(feedURL: URL, targetCalendarID: String) async {
        guard !isRunning else { return }

        isRunning = true
        defer { isRunning = false }

        do {
            try await requestAccess()

            guard let calendar = eventStore.calendar(withIdentifier: targetCalendarID) else {
                throw NSError(
                    domain: "FootballCalendarSync",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Der ausgewählte Kalender wurde nicht gefunden."]
                )
            }

            guard calendar.allowsContentModifications else {
                throw NSError(
                    domain: "FootballCalendarSync",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "Der ausgewählte Kalender ist schreibgeschützt."]
                )
            }

            let remoteEvents = try await FeedParser().load(from: feedURL)

            guard !remoteEvents.isEmpty else {
                throw NSError(
                    domain: "FootballCalendarSync",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Der Feed enthält 0 Termine. Aus Sicherheitsgründen wurde nichts geändert oder gelöscht."]
                )
            }

            let result = try reconcile(remoteEvents: remoteEvents, calendar: calendar)
            UserDefaults.standard.set(Date(), forKey: "footballCalendarLastSuccessfulSync")

            status = "Fertig: \(result.created) neu, \(result.adopted) übernommen, \(result.updated) geändert, \(result.deleted) gelöscht, \(result.unchanged) unverändert."
        } catch {
            status = error.localizedDescription
        }
    }

    private func reconcile(
        remoteEvents: [RemoteCalendarEvent],
        calendar: EKCalendar
    ) throws -> SyncResult {
        let calendarStart = Calendar.current.date(byAdding: .year, value: -1, to: Date())!
        let calendarEnd = Calendar.current.date(byAdding: .year, value: 3, to: Date())!

        let predicate = eventStore.predicateForEvents(
            withStart: calendarStart,
            end: calendarEnd,
            calendars: [calendar]
        )

        let existingEvents = eventStore.events(matching: predicate)

        var existingByRemoteID: [String: EKEvent] = [:]
        var unmarkedEvents: [EKEvent] = []

        for event in existingEvents {
            if let id = remoteID(from: event.notes) {
                existingByRemoteID[id] = event
            } else {
                unmarkedEvents.append(event)
            }
        }

        var created = 0
        var adopted = 0
        var updated = 0
        var deleted = 0
        var unchanged = 0
        let remoteIDs = Set(remoteEvents.map(\.id))
        var adoptedEventIdentifiers = Set<String>()

        for remote in remoteEvents {
            if let existing = existingByRemoteID[remote.id] {
                if apply(remote, to: existing) {
                    try eventStore.save(existing, span: .thisEvent, commit: false)
                    updated += 1
                } else {
                    unchanged += 1
                }
                continue
            }

            if let legacy = bestLegacyExternalIDMatch(
                for: remote,
                in: unmarkedEvents,
                excluding: adoptedEventIdentifiers
            ) ?? bestManualDuplicateMatch(
                for: remote,
                in: unmarkedEvents,
                excluding: adoptedEventIdentifiers
            ) {
                adoptedEventIdentifiers.insert(legacy.eventIdentifier)

                try eventStore.remove(legacy, span: .thisEvent, commit: false)

                let replacement = EKEvent(eventStore: eventStore)
                replacement.calendar = calendar
                apply(remote, to: replacement)
                try eventStore.save(replacement, span: .thisEvent, commit: false)

                adopted += 1
                continue
            }

            let event = EKEvent(eventStore: eventStore)
            event.calendar = calendar
            apply(remote, to: event)
            try eventStore.save(event, span: .thisEvent, commit: false)
            created += 1
        }

        for existing in existingEvents {
            guard
                let id = remoteID(from: existing.notes),
                !remoteIDs.contains(id)
            else {
                continue
            }

            try eventStore.remove(existing, span: .thisEvent, commit: false)
            deleted += 1
        }

        if created + adopted + updated + deleted > 0 {
            try eventStore.commit()
        }

        return SyncResult(
            created: created,
            adopted: adopted,
            updated: updated,
            deleted: deleted,
            unchanged: unchanged
        )
    }

    private func bestLegacyExternalIDMatch(
        for remote: RemoteCalendarEvent,
        in events: [EKEvent],
        excluding usedIdentifiers: Set<String>
    ) -> EKEvent? {
        events.first { event in
            guard !usedIdentifiers.contains(event.eventIdentifier) else {
                return false
            }

            return event.calendarItemExternalIdentifier == remote.id
        }
    }

    private func bestManualDuplicateMatch(
        for remote: RemoteCalendarEvent,
        in events: [EKEvent],
        excluding usedIdentifiers: Set<String>
    ) -> EKEvent? {
        let normalizedRemoteTitle = normalize(remote.title)

        let candidates = events
            .filter { event in
                guard !usedIdentifiers.contains(event.eventIdentifier) else {
                    return false
                }

                guard normalize(event.title ?? "") == normalizedRemoteTitle else {
                    return false
                }

                guard let start = event.startDate else {
                    return false
                }

                guard Calendar.current.isDate(start, inSameDayAs: remote.start) else {
                    return false
                }

                return abs(start.timeIntervalSince(remote.start)) <= 3 * 60 * 60
            }
            .sorted {
                abs(($0.startDate ?? .distantPast).timeIntervalSince(remote.start)) <
                abs(($1.startDate ?? .distantPast).timeIntervalSince(remote.start))
            }

        if candidates.count == 1 {
            return candidates[0]
        }

        guard candidates.count >= 2 else {
            return nil
        }

        let bestDelta = abs((candidates[0].startDate ?? .distantPast).timeIntervalSince(remote.start))
        let secondDelta = abs((candidates[1].startDate ?? .distantPast).timeIntervalSince(remote.start))

        if bestDelta <= 30 * 60 && secondDelta - bestDelta >= 60 * 60 {
            return candidates[0]
        }

        return nil
    }

    private func normalize(_ value: String) -> String {
        value
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .replacingOccurrences(of: "–", with: "-")
            .replacingOccurrences(of: "—", with: "-")
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
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
}
