import Foundation

struct RemoteCalendarEvent: Identifiable, Hashable {
    let id: String
    let title: String
    let start: Date
    let end: Date
    let notes: String?
    let location: String?
    let url: URL?
}
