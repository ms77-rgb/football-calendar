import CalendarBuilder from "@/app/components/calendar-builder";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 900,
        margin: "48px auto",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        lineHeight: 1.5
      }}
    >
      <header style={{ marginBottom: 28 }}>
        <p style={{ marginBottom: 6, color: "#4b5563" }}>Football Calendar</p>
        <h1 style={{ marginTop: 0 }}>Mehrere Fußballteams. Ein Kalender.</h1>
        <p style={{ maxWidth: 720 }}>
          Suche deinen Verein direkt bei FUSSBALL.DE, wähle die gewünschten
          Mannschaften aus und abonniere anschließend einen gemeinsamen
          Kalender.
        </p>
      </header>

      <CalendarBuilder />

      <hr
        style={{
          margin: "40px 0",
          border: 0,
          borderTop: "1px solid #e5e7eb"
        }}
      />

      <section>
        <h2>SpielerPlus testen</h2>
        <p>
          Für den nächsten Integrationsschritt gibt es eine geschützte
          Entwicklungsseite zum Prüfen einer bestehenden SpielerPlus-Sitzung.
        </p>
        <p>
          <a href="/dev/spielerplus">SpielerPlus-Sitzung testen →</a>
        </p>
      </section>

      <hr
        style={{
          margin: "40px 0",
          border: 0,
          borderTop: "1px solid #e5e7eb"
        }}
      />

      <section>
        <h2>So funktioniert es</h2>
        <ol>
          <li>Vereinsnamen eingeben und den richtigen Verein auswählen.</li>
          <li>Eine oder mehrere Mannschaften anklicken.</li>
          <li>Den erzeugten Kalender testen oder direkt abonnieren.</li>
          <li>
            Änderungen bei FUSSBALL.DE werden beim nächsten Kalenderabruf
            automatisch übernommen.
          </li>
        </ol>
      </section>
    </main>
  );
}
