import Foundation

enum FeedParserError: LocalizedError {
    case invalidResponse(statusCode: Int?)
    case notCalendar(contentType: String?, preview: String)
    case noEvents(foundBlocks: Int, rejected: Int, firstProblem: String?)

    var errorDescription: String? {
        switch self {
        case .invalidResponse(let statusCode):
            if let statusCode {
                return "Der Kalender-Feed konnte nicht geladen werden (HTTP \(statusCode))."
            }
            return "Der Kalender-Feed konnte nicht geladen werden."

        case .notCalendar(let contentType, let preview):
            let typeText = contentType ?? "unbekannt"
            return "Die Antwort ist kein ICS-Kalender. Content-Type: \(typeText). Anfang: \(preview)"

        case .noEvents(let foundBlocks, let rejected, let firstProblem):
            var message = "ICS erkannt, aber 0 Termine konnten gelesen werden. VEVENT-Blöcke: \(foundBlocks), verworfen: \(rejected)."
            if let firstProblem {
                message += " Erstes Problem: \(firstProblem)"
            }
            return message
        }
    }
}

struct FeedParser {
    private let utcFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter
    }()

    private let localFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone.current
        formatter.dateFormat = "yyyyMMdd'T'HHmmss"
        return formatter
    }()

    func load(from url: URL) async throws -> [RemoteCalendarEvent] {
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let http = response as? HTTPURLResponse else {
            throw FeedParserError.invalidResponse(statusCode: nil)
        }

        guard (200..<300).contains(http.statusCode) else {
            throw FeedParserError.invalidResponse(statusCode: http.statusCode)
        }

        guard let text = String(data: data, encoding: .utf8) else {
            throw FeedParserError.notCalendar(
                contentType: http.value(forHTTPHeaderField: "Content-Type"),
                preview: "<nicht UTF-8>"
            )
        }

        guard text.contains("BEGIN:VCALENDAR") else {
            throw FeedParserError.notCalendar(
                contentType: http.value(forHTTPHeaderField: "Content-Type"),
                preview: String(text.prefix(120))
                    .replacingOccurrences(of: "\n", with: " ")
                    .replacingOccurrences(of: "\r", with: " ")
            )
        }

        return try parse(text)
    }

    func parse(_ text: String) throws -> [RemoteCalendarEvent] {
        let unfolded = unfoldLines(text)
        var events: [RemoteCalendarEvent] = []
        var current: [String: String]?
        var foundBlocks = 0
        var rejected = 0
        var firstProblem: String?

        for line in unfolded {
            if line == "BEGIN:VEVENT" {
                foundBlocks += 1
                current = [:]
                continue
            }

            if line == "END:VEVENT" {
                if let values = current {
                    switch makeEvent(from: values) {
                    case .success(let event):
                        events.append(event)
                    case .failure(let reason):
                        rejected += 1
                        if firstProblem == nil {
                            firstProblem = reason
                        }
                    }
                }
                current = nil
                continue
            }

            guard current != nil, let separator = line.firstIndex(of: ":") else {
                continue
            }

            let rawKey = String(line[..<separator])
            let key = rawKey.split(separator: ";", maxSplits: 1).first.map(String.init) ?? rawKey
            let value = String(line[line.index(after: separator)...])
            current?[key] = unescape(value)
        }

        guard !events.isEmpty else {
            throw FeedParserError.noEvents(
                foundBlocks: foundBlocks,
                rejected: rejected,
                firstProblem: firstProblem
            )
        }

        return events
    }

    private enum EventBuildResult {
        case success(RemoteCalendarEvent)
        case failure(String)
    }

    private func makeEvent(from values: [String: String]) -> EventBuildResult {
        guard let uid = values["UID"], !uid.isEmpty else {
            return .failure("UID fehlt")
        }

        guard let title = values["SUMMARY"], !title.isEmpty else {
            return .failure("SUMMARY fehlt")
        }

        guard let startValue = values["DTSTART"] else {
            return .failure("DTSTART fehlt")
        }

        guard let endValue = values["DTEND"] else {
            return .failure("DTEND fehlt")
        }

        guard let start = parseDate(startValue) else {
            return .failure("DTSTART nicht lesbar: \(startValue)")
        }

        guard let end = parseDate(endValue) else {
            return .failure("DTEND nicht lesbar: \(endValue)")
        }

        return .success(
            RemoteCalendarEvent(
                id: uid,
                title: title,
                start: start,
                end: end,
                notes: values["DESCRIPTION"],
                location: values["LOCATION"],
                url: values["URL"].flatMap(URL.init(string:))
            )
        )
    }

    private func parseDate(_ value: String) -> Date? {
        if value.hasSuffix("Z") {
            return utcFormatter.date(from: value)
        }

        return localFormatter.date(from: value)
    }

    private func unfoldLines(_ text: String) -> [String] {
        let rawLines = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .components(separatedBy: "\n")

        var lines: [String] = []

        for raw in rawLines {
            if (raw.hasPrefix(" ") || raw.hasPrefix("\t")), !lines.isEmpty {
                lines[lines.count - 1] += String(raw.dropFirst())
            } else {
                lines.append(raw)
            }
        }

        return lines
    }

    private func unescape(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\n", with: "\n")
            .replacingOccurrences(of: "\\N", with: "\n")
            .replacingOccurrences(of: "\\,", with: ",")
            .replacingOccurrences(of: "\\;", with: ";")
            .replacingOccurrences(of: "\\\\", with: "\\")
    }
}
