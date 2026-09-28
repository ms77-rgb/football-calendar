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

export default function SpielerPlusProbePage() {
  const [url, setUrl] = useState("https://www.spielerplus.de/");
  const [cookieHeader, setCookieHeader] = useState("");
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

      <h1>SpielerPlus-Sitzung testen</h1>
      <p>
        Diese Entwicklungsseite prüft, ob wir mit einer bestehenden
        SpielerPlus-Sitzung eine angemeldete Seite lesen können.
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
        <strong>Wichtig:</strong> Verwende hier nur eine temporäre Sitzung. Der
        Cookie wird nicht gespeichert und nicht in einer URL abgelegt. Trotzdem
        ist ein Session-Cookie ein Zugangsschlüssel. Teile ihn nicht im Chat
        und widerrufe die Sitzung nach dem Test am besten durch Abmelden bei
        SpielerPlus.
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>SpielerPlus-URL</span>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.spielerplus.de/..."
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

        <button
          type="submit"
          disabled={loading || !url.trim() || !cookieHeader.trim()}
          style={{ padding: "12px 18px", width: "fit-content" }}
        >
          {loading ? "Prüfe…" : "Sitzung prüfen"}
        </button>
      </form>

      {error ? (
        <p role="alert" style={{ color: "#b91c1c", marginTop: 20 }}>
          {error}
        </p>
      ) : null}

      {result ? (
        <section style={{ marginTop: 32 }}>
          <h2>Ergebnis</h2>

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

          <h3>Relevante interne Links</h3>
          {result.relevantLinks.length ? (
            <ul>
              {result.relevantLinks.map((link) => (
                <li key={link.href}>
                  <span>{link.text}</span>
                  <br />
                  <code style={{ overflowWrap: "anywhere" }}>{link.href}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p>Keine passenden Termin-/Team-Links gefunden.</p>
          )}
        </section>
      ) : null}
    </main>
  );
}
