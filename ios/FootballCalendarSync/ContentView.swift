import SwiftUI

struct ContentView: View {
    @StateObject private var syncService = CalendarSyncService()
    @AppStorage("footballCalendarFeedURL") private var feedURL = ""
    @AppStorage("footballCalendarTargetCalendarID") private var selectedCalendarID = ""

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

                Section("Zielkalender") {
                    if syncService.calendars.isEmpty {
                        Button("Kalender laden") {
                            Task {
                                await syncService.loadCalendars()
                            }
                        }
                    } else {
                        Picker("iCloud-/iPhone-Kalender", selection: $selectedCalendarID) {
                            Text("Bitte auswählen").tag("")
                            ForEach(syncService.calendars) { calendar in
                                Text("\(calendar.title) — \(calendar.sourceTitle)")
                                    .tag(calendar.id)
                            }
                        }

                        Text("Wähle genau den iCloud-Kalender, in den du die alten Fußballtermine bereits importiert hast. Bestehende passende Termine werden übernommen statt doppelt angelegt.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Synchronisieren") {
                    Button {
                        guard let url = URL(string: feedURL), !feedURL.isEmpty else {
                            syncService.status = "Bitte zuerst eine gültige Feed-Adresse eintragen."
                            return
                        }

                        guard !selectedCalendarID.isEmpty else {
                            syncService.status = "Bitte zuerst den iCloud-Kalender auswählen, in den die Termine importiert wurden."
                            return
                        }

                        Task {
                            await syncService.sync(
                                feedURL: url,
                                targetCalendarID: selectedCalendarID
                            )
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
                    Text("Die App synchronisiert direkt in den ausgewählten iCloud-Kalender. Bereits importierte Football-Termine werden anhand ihrer ursprünglichen Kalender-ID oder — falls nötig — konservativ über Titel, Startzeit und Dauer erkannt und mit unserer Football-Calendar-ID übernommen. Danach werden Änderungen aktualisiert und verwaltete Termine, die nicht mehr im Feed stehen, gelöscht. Andere Termine im selben Kalender bleiben unangetastet.")
                }
            }
            .navigationTitle("Football Sync")
            .task {
                await syncService.loadCalendars()
            }
        }
    }
}
