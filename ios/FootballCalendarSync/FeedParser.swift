import Foundation

enum FeedParserError: LocalizedError {
    case invalidResponse
    case invalidCalendar

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Der Kalender-Feed konnte nicht geladen werden."
        case .invalidCalendar:
            return "Der Kalender-Feed enthält keine gültigen Termine."
        }
    }
}

struct FeedParser {
    private let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
        return formatter
    }()

    func load(from url: URL) async throws -> [RemoteCalendarEvent] {
        let (data, response) = try await URLSession.shared.data(from: url)

        guard
            let http = response as? HTTPURLResponse,
            (200..<300).contains(http.statusCode),
            let text = String(data: data, encoding: .utf8)
        else {
            throw FeedParserError.invalidResponse
        }

        return try parse(text)
    }

    func parse(_ text: String) throws -> [RemoteCalendarEvent] {
        let unfolded = unfoldLines(text)
        var events: [RemoteCalendarEvent] = []
        var current: [String: String]?

        for line in unfolded {
            if line == "BEGIN:VEVENT" {
                current = [:]
                continue
            }

            if line == "END:VEVENT" {
                if let values = current, let event = makeEvent(from: values) {
                    events.append(event)
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

        if events.isEmpty && text.contains("BEGIN:VEVENT") {
            throw FeedParserError.invalidCalendar
        }

        return events
    }

    private func makeEvent(from values: [String: String]) -> RemoteCalendarEvent? {
        guard
            let uid = values["UID"],
            let title = values["SUMMARY"],
            let startValue = values["DTSTART"],
            let endValue = values["DTEND"],
            let start = formatter.date(from: startValue),
            let end = formatter.date(from: endValue)
        else {
            return nil
        }

        return RemoteCalendarEvent(
            id: uid,
            title: title,
            start: start,
            end: end,
            notes: values["DESCRIPTION"],
            location: values["LOCATION"],
            url: values["URL"].flatMap(URL.init(string:))
        )
    }

    private func unfoldLines(_ text: String) -> [String] {
        let rawLines = text
            .replacingOccurrences(of: "\r\n", with: "\n")
            .components(separatedBy: "\n")

        var lines: [String] = []
        for raw in rawLines {
            if raw.hasPrefix(" "), !lines.isEmpty {
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
            .replacingOccurrences(of: "\\,", with: ",")
            .replacingOccurrences(of: "\\;", with: ";")
            .replacingOccurrences(of: "\\\\", with: "\\")
    }
}
