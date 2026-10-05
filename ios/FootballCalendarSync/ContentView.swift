import SwiftUI

struct ContentView: View {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var syncService = CalendarSyncService()
    @AppStorage("footballCalendarFeedURL") private var feedURL = ""
    @AppStorage("footballCalendarTargetCalendarID") private var selectedCalendarID = ""
    @AppStorage("footballCalendarAutoSyncEnabled") private var autoSyncEnabled = true

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
                            Task { await syncService.loadCalendars() }
                        }
                    } else {
                        Picker("iCloud-/iPhone-Kalender", selection: $selectedCalendarID) {
                            Text("Bitte auswählen").tag("")
                            ForEach(syncService.calendars) { calendar in
                                Text("\(calendar.title) — \(calendar.sourceTitle)")
                                    .tag(calendar.id)
                            }
                        }
                    }

                    Text("Bestehende passende Termine im ausgewählten Kalender werden übernommen statt doppelt angelegt.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Automatisch synchronisieren") {
                    Toggle("Einmal täglich aktualisieren", isOn: $autoSyncEnabled)
                        .onChange(of: autoSyncEnabled) { _, enabled in
                            if enabled {
                                BackgroundSync.scheduleDaily()
                            } else {
                                BackgroundSync.cancel()
                            }
                        }

                    Text("iOS entscheidet selbst, wann die Hintergrund-Aktualisierung ausgeführt wird. Die App plant ungefähr alle 24 Stunden eine Aktualisierung und holt eine verpasste Aktualisierung beim nächsten Öffnen nach.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Synchronisieren") {
                    Button {
                        guard let url = URL(string: feedURL), !feedURL.isEmpty else {
                            syncService.status = "Bitte zuerst eine gültige Feed-Adresse eintragen."
                            return
                        }

                        guard !selectedCalendarID.isEmpty else {
                            syncService.status = "Bitte zuerst den Zielkalender auswählen."
                            return
                        }

                        Task {
                            await syncService.sync(
                                feedURL: url,
                                targetCalendarID: selectedCalendarID
                            )

                            if autoSyncEnabled {
                                BackgroundSync.scheduleDaily()
                            }
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

                Section("Doppelte Termine") {
                    Text("Bei bereits händisch eingetragenen Terminen sucht Football Sync nach demselben Betreff am selben Tag und einer ähnlichen Startzeit. Wird genau ein plausibler Treffer gefunden, wird dieser Termin übernommen und künftig aktualisiert, statt einen zweiten Termin anzulegen.")
                }
            }
            .navigationTitle("Football Sync")
            .task {
                await syncService.loadCalendars()

                if autoSyncEnabled {
                    BackgroundSync.scheduleDaily()
                    await catchUpIfNeeded()
                }
            }
            .onChange(of: scenePhase) { _, phase in
                guard phase == .active, autoSyncEnabled else { return }

                Task {
                    await catchUpIfNeeded()
                }
            }
        }
    }

    private func catchUpIfNeeded() async {
        guard
            !syncService.isRunning,
            !feedURL.isEmpty,
            !selectedCalendarID.isEmpty,
            let url = URL(string: feedURL)
        else {
            return
        }

        let lastSync = UserDefaults.standard.object(
            forKey: "footballCalendarLastSuccessfulSync"
        ) as? Date

        if lastSync == nil || Date().timeIntervalSince(lastSync!) >= 24 * 60 * 60 {
            await syncService.sync(
                feedURL: url,
                targetCalendarID: selectedCalendarID
            )
        }
    }
}
