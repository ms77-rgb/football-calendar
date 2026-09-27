export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: "64px auto", fontFamily: "system-ui", padding: 24 }}>
      <h1>Football Calendar</h1>
      <p>
        Ein universeller Kalender-Aggregator für Fußballteams und Team-Apps.
      </p>

      <h2>MVP-Status</h2>
      <ul>
        <li>Gemeinsames Event-Modell</li>
        <li>Connector-Schnittstelle</li>
        <li>Normalisierung und Deduplizierung</li>
        <li>ICS-Feed</li>
      </ul>

      <p>
        Demo-Feed: <a href="/api/calendar/demo">/api/calendar/demo</a>
      </p>
    </main>
  );
}
