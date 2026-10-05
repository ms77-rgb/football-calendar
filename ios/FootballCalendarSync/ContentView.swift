import SwiftUI

struct ContentView: View {
    @StateObject private var syncService = CalendarSyncService()
    @AppStorage("footballCalendarFeedURL") private var feedURL = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Kalender-Feed") {
                    SecureField("https://…/api/calendar/feed/…", text: $feedURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    Text("Die Feed-Adresse enthält deinen privaten Kalender-Token. Sie wird nur auf diesem Gerät gespeichert.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Synchronisieren") {
                    Button {
                        guard let url = URL(string: feedURL), !feedURL.isEmpty else {
                            syncService.status = "Bitte zuerst eine gültige Feed-Adresse eintragen."
                            return
                        }

                        Task {
                            await syncService.sync(feedURL: url)
                        }
                    } label: {
                        HStack {
                            if syncService.isRunning {
                                ProgressView()
                            }
                            Text("Jetzt synchronisieren")
                        }
                    }
                    .disabled(syncService.isRunning)

                    Text(syncService.status)
                        .font(.footnote)
                }

                Section("So arbeitet die App") {
                    Text("Neue Termine werden angelegt. Bereits bekannte Termine werden über eine stabile Football-Calendar-ID erkannt und nicht doppelt importiert. Änderungen werden aktualisiert. Termine, die nicht mehr im Feed stehen, werden aus dem eigenen Kalender „Fußball + SpielerPlus“ gelöscht.")
                }
            }
            .navigationTitle("Football Sync")
        }
    }
}
