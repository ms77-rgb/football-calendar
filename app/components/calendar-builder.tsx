"use client";

import { useMemo, useState } from "react";

type TeamRow = {
  reference: string;
  name: string;
};

const EMPTY_TEAM: TeamRow = { reference: "", name: "" };

function toWebcal(url: string): string {
  return url.replace(/^https?:\/\//, "webcal://");
}

export default function CalendarBuilder() {
  const [teams, setTeams] = useState<TeamRow[]>([
    {
      reference:
        "https://www.fussball.de/mannschaft/tus-1896-sachsenhausen-u16-tus-1896-sachsenhausen-brandenburg/-/saison/2627/team-id/02TBFC6PAG000000VS5489BSVV9JRPRB#!/",
      name: "TuS 1896 Sachsenhausen U16"
    }
  ]);
  const [copied, setCopied] = useState(false);

  const feedUrl = useMemo(() => {
    if (typeof window === "undefined") return "";

    const validTeams = teams.filter((team) => team.reference.trim());
    if (validTeams.length === 0) return "";

    const url = new URL("/api/calendar/multi", window.location.origin);

    for (const team of validTeams) {
      const value = team.name.trim()
        ? `${team.reference.trim()}::${team.name.trim()}`
        : team.reference.trim();
      url.searchParams.append("team", value);
    }

    return url.toString();
  }, [teams]);

  function updateTeam(index: number, field: keyof TeamRow, value: string) {
    setTeams((current) =>
      current.map((team, teamIndex) =>
        teamIndex === index ? { ...team, [field]: value } : team
      )
    );
    setCopied(false);
  }

  function addTeam() {
    setTeams((current) =>
      current.length >= 5 ? current : [...current, { ...EMPTY_TEAM }]
    );
  }

  function removeTeam(index: number) {
    setTeams((current) => current.filter((_, teamIndex) => teamIndex !== index));
    setCopied(false);
  }

  async function copyFeedUrl() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
  }

  return (
    <section>
      <div style={{ display: "grid", gap: 16 }}>
        {teams.map((team, index) => (
          <div
            key={index}
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 12,
              padding: 16,
              display: "grid",
              gap: 10
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12
              }}
            >
              <strong>Mannschaft {index + 1}</strong>
              {teams.length > 1 ? (
                <button type="button" onClick={() => removeTeam(index)}>
                  Entfernen
                </button>
              ) : null}
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span>FUSSBALL.DE-Link oder Team-ID</span>
              <input
                value={team.reference}
                onChange={(event) =>
                  updateTeam(index, "reference", event.target.value)
                }
                placeholder="https://www.fussball.de/.../team-id/..."
                style={{ padding: 10, fontSize: 16 }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Name im Kalender (optional)</span>
              <input
                value={team.name}
                onChange={(event) => updateTeam(index, "name", event.target.value)}
                placeholder="z. B. TuS 1896 Sachsenhausen U16"
                style={{ padding: 10, fontSize: 16 }}
              />
            </label>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={addTeam}
          disabled={teams.length >= 5}
          style={{ padding: "10px 14px" }}
        >
          + Mannschaft hinzufügen
        </button>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 18,
          borderRadius: 12,
          background: "#f3f4f6"
        }}
      >
        <h2 style={{ marginTop: 0 }}>Dein gemeinsamer Kalender</h2>
        {feedUrl ? (
          <>
            <p style={{ overflowWrap: "anywhere" }}>{feedUrl}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={copyFeedUrl}
                style={{ padding: "10px 14px" }}
              >
                {copied ? "Link kopiert" : "Kalender-Link kopieren"}
              </button>
              <a href={feedUrl} style={{ padding: "10px 0" }}>
                Kalender testen
              </a>
              <a href={toWebcal(feedUrl)} style={{ padding: "10px 0" }}>
                Kalender abonnieren
              </a>
            </div>
          </>
        ) : (
          <p>Trage mindestens eine Mannschaft ein.</p>
        )}
      </div>

      <p style={{ marginTop: 18, color: "#4b5563" }}>
        Für das MVP können bis zu fünf Mannschaften kombiniert werden. Spiele,
        die in zwei ausgewählten Mannschaften gleichzeitig vorkommen, werden
        anhand ihrer FUSSBALL.DE-Spiel-ID nur einmal ausgegeben.
      </p>
    </section>
  );
}
