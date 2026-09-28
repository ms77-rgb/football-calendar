"use client";

import { FormEvent, useState } from "react";

type ProbeResult = {
  status: number;
  finalUrl: string;
  title: string;
  contentType: string;
  bodyLength: number;
  loginDetected: boolean;
  eventSignals: string[];
  relevantLinks: Array<{ text: string; href: string }>;
};

type SpielerPlusEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  description: string | null;
  url: string | null;
};

type EventsResult = {
  count: number;
  events: SpielerPlusEvent[];
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin"
  }).format(new Date(value));
}

export default function SpielerPlusProbePage() {
  const [url, setUrl] = useState("https://www.spielerplus.de/events/index");
  const [cookieHeader, setCookieHeader] = useState("");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [eventsResult, setEventsResult] = useState<EventsResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/spielerplus/probe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url, cookieHeader })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Prüfung fehlgeschlagen.");
      }

      setResult(data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Prüfung fehlgeschlagen."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    setLoadingEvents(true);
    setError("");
    setEventsResult(null);

    try {
      const response = await fetch("/api/spielerplus/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ cookieHeader })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || "Termine konnten nicht gelesen werden."
        );
      }

      setEventsResult(data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Termine konnten nicht gelesen werden."
      );
    } finally {
      setLoadingEvents(false);
    }
  }

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
      <a href="/">← Zurück</a>

      <h1>SpielerPlus testen</h1>
      <p>
        Diese Entwicklungsseite prüft eine bestehende SpielerPlus-Sitzung und
        kann anschließend die sichtbaren Trainings und Spiele aus der
        Terminliste einlesen.
      </p>

      <div
        style={{
          padding: 16,
          border: "1px solid #f59e0b",
          borderRadius: 12,
          background: "#fffbeb",
          marginBottom: 24
        }}
      >
        <strong>Wichtig:</strong> Verwende nur eine temporäre Sitzung. Der
        Cookie wird von diesem MVP nicht gespeichert und nicht in einer URL
        abgelegt. Trotzdem ist ein Session-Cookie ein Zugangsschlüssel. Teile
        ihn nicht im Chat und melde dich nach dem Test bei SpielerPlus ab, wenn
        du die Sitzung widerrufen möchtest.
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>SpielerPlus-URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.spielerplus.de/events/index"
            style={{ padding: 12, fontSize: 16 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Cookie-Header aus dem Browser</span>
          <textarea
            value={cookieHeader}
            onChange={(event) => setCookieHeader(event.target.value)}
            placeholder="Cookie: name=value; another=value"
            rows={6}
            spellCheck={false}
            style={{ padding: 12, fontSize: 14, fontFamily: "monospace" }}
          />
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={loading || !url.trim() || !cookieHeader.trim()}
            style={{ padding: "12px 18px", width: "fit-content" }}
          >
            {loading ? "Prüfe…" : "Sitzung prüfen"}
          </button>

          <button
            type="button"
            onClick={loadEvents}
            disabled={loadingEvents || !cookieHeader.trim()}
            style={{ padding: "12px 18px", width: "fit-content" }}
          >
            {loadingEvents ? "Lade Termine…" : "Termine lesen"}
          </button>
        </div>
      </form>

      {error ? (
        <p role="alert" style={{ color: "#b91c1c", marginTop: 20 }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <section style={{ marginTop: 32 }}>
          <h2>Sitzungsprüfung</h2>

          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              gap: "8px 16px"
            }}
          >
            <dt>Status</dt>
            <dd>{result.status}</dd>
            <dt>Finale URL</dt>
            <dd style={{ overflowWrap: "anywhere" }}>{result.finalUrl}</dd>
            <dt>Titel</dt>
            <dd>{result.title || "—"}</dd>
            <dt>Login erkannt</dt>
            <dd>{result.loginDetected ? "Ja" : "Nein"}</dd>
            <dt>Terminsignale</dt>
            <dd>
              {result.eventSignals.length
                ? result.eventSignals.join(", ")
                : "keine"}
            </dd>
            <dt>HTML-Größe</dt>
            <dd>{result.bodyLength.toLocaleString("de-DE")} Zeichen</dd>
          </dl>
        </section>
      ) : null}

      {eventsResult ? (
        <section style={{ marginTop: 32 }}>
          <h2>Gefundene SpielerPlus-Termine</h2>
          <p>{eventsResult.count} Termine gefunden.</p>

          {eventsResult.events.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {eventsResult.events.map((event) => (
                <article
                  key={event.id}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    padding: 14
                  }}
                >
                  <strong>{event.title}</strong>
                  <div>{formatDateTime(event.startsAt)} – {formatDateTime(event.endsAt)}</div>
                  {event.location ? <div>{event.location}</div> : null}
                  <code style={{ fontSize: 12 }}>{event.id}</code>
                </article>
              ))}
            </div>
          ) : (
            <p>
              Keine Trainings- oder Spiel-Links in der aktuellen Terminliste
              gefunden.
            </p>
          )}
        </section>
      ) : null}
    </main>
  );
}
