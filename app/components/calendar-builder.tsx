"use client";

import { FormEvent, useMemo, useState } from "react";

type SelectedTeam = {
  reference: string;
  name: string;
};

type ClubResult = {
  name: string;
  url: string;
};

type TeamResult = {
  id: string;
  name: string;
  url: string;
};

function toWebcal(url: string): string {
  return url.replace(/^https?:\/\//, "webcal://");
}

export default function CalendarBuilder() {
  const [teams, setTeams] = useState<SelectedTeam[]>([]);
  const [query, setQuery] = useState("");
  const [clubs, setClubs] = useState<ClubResult[]>([]);
  const [clubName, setClubName] = useState("");
  const [clubTeams, setClubTeams] = useState<TeamResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const feedUrl = useMemo(() => {
    if (typeof window === "undefined" || teams.length === 0) return "";

    const url = new URL("/api/calendar/multi", window.location.origin);

    for (const team of teams) {
      url.searchParams.append(
        "team",
        `${team.reference.trim()}::${team.name.trim()}`
      );
    }

    return url.toString();
  }, [teams]);

  async function searchClubs(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    setSearching(true);
    setError("");
    setClubs([]);
    setClubTeams([]);
    setClubName("");

    try {
      const response = await fetch(
        `/api/fussball-de/search?q=${encodeURIComponent(trimmed)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.error || "Suche fehlgeschlagen.");
      }

      setClubs(data.clubs ?? []);
      if ((data.clubs ?? []).length === 0) {
        setError("Kein Verein gefunden. Probiere einen anderen Suchbegriff.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Suche fehlgeschlagen.");
    } finally {
      setSearching(false);
    }
  }

  async function selectClub(club: ClubResult) {
    setLoadingTeams(true);
    setError("");
    setClubName(club.name);
    setClubTeams([]);

    try {
      const response = await fetch(
        `/api/fussball-de/teams?club=${encodeURIComponent(club.url)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || data.error || "Mannschaften konnten nicht geladen werden."
        );
      }

      setClubTeams(data.teams ?? []);
      if ((data.teams ?? []).length === 0) {
        setError("Für diesen Verein wurden keine Mannschaften gefunden.");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Mannschaften konnten nicht geladen werden."
      );
    } finally {
      setLoadingTeams(false);
    }
  }

  function addTeam(team: TeamResult) {
    setTeams((current) => {
      if (current.some((selected) => selected.reference === team.id)) {
        return current;
      }
      if (current.length >= 5) return current;

      return [...current, { reference: team.id, name: team.name }];
    });
    setCopied(false);
  }

  function removeTeam(reference: string) {
    setTeams((current) =>
      current.filter((team) => team.reference !== reference)
    );
    setCopied(false);
  }

  async function copyFeedUrl() {
    if (!feedUrl) return;
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
  }

  return (
    <section>
      <div
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 14,
          padding: 18
        }}
      >
        <h2 style={{ marginTop: 0 }}>1. Verein suchen</h2>

        <form
          onSubmit={searchClubs}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="z. B. TuS 1896 Sachsenhausen"
            aria-label="Vereinsname"
            style={{
              flex: "1 1 300px",
              minWidth: 0,
              padding: 12,
              fontSize: 16
            }}
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            style={{ padding: "12px 18px" }}
          >
            {searching ? "Suche…" : "Verein suchen"}
          </button>
        </form>

        {clubs.length > 0 ? (
          <div style={{ marginTop: 18 }}>
            <strong>Gefundene Vereine</strong>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {clubs.map((club) => (
                <button
                  key={club.url}
                  type="button"
                  onClick={() => selectClub(club)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    background: "white",
                    cursor: "pointer"
                  }}
                >
                  {club.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {loadingTeams ? <p>Mannschaften werden geladen…</p> : null}

        {clubTeams.length > 0 ? (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ marginBottom: 8 }}>2. Mannschaft auswählen</h2>
            <p style={{ marginTop: 0, color: "#4b5563" }}>{clubName}</p>
            <div style={{ display: "grid", gap: 8 }}>
              {clubTeams.map((team) => {
                const selected = teams.some(
                  (current) => current.reference === team.id
                );

                return (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => addTeam(team)}
                    disabled={selected || (!selected && teams.length >= 5)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      textAlign: "left",
                      padding: 12,
                      border: "1px solid #d1d5db",
                      borderRadius: 10,
                      background: selected ? "#f3f4f6" : "white",
                      cursor: selected ? "default" : "pointer"
                    }}
                  >
                    <span>{team.name}</span>
                    <span>{selected ? "Ausgewählt" : "+ Hinzufügen"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" style={{ color: "#b91c1c", marginBottom: 0 }}>
            {error}
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 28 }}>
        <h2>3. Ausgewählte Mannschaften</h2>

        {teams.length === 0 ? (
          <p style={{ color: "#4b5563" }}>
            Noch keine Mannschaft ausgewählt.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {teams.map((team) => (
              <div
                key={team.reference}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid #d1d5db",
                  borderRadius: 10
                }}
              >
                <span>{team.name}</span>
                <button
                  type="button"
                  onClick={() => removeTeam(team.reference)}
                >
                  Entfernen
                </button>
              </div>
            ))}
          </div>
        )}

        <p style={{ color: "#4b5563" }}>
          {teams.length}/5 Mannschaften ausgewählt
        </p>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 18,
          borderRadius: 12,
          background: "#f3f4f6"
        }}
      >
        <h2 style={{ marginTop: 0 }}>4. Dein gemeinsamer Kalender</h2>

        {feedUrl ? (
          <>
            <p>
              Fertig. Du kannst den Kalender testen oder direkt abonnieren.
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <a href={toWebcal(feedUrl)} style={{ padding: "10px 0" }}>
                Kalender abonnieren
              </a>
              <a href={feedUrl} style={{ padding: "10px 0" }}>
                Kalender testen
              </a>
              <button
                type="button"
                onClick={copyFeedUrl}
                style={{ padding: "10px 14px" }}
              >
                {copied ? "Link kopiert" : "Link kopieren"}
              </button>
            </div>
          </>
        ) : (
          <p>Wähle mindestens eine Mannschaft aus.</p>
        )}
      </div>
    </section>
  );
}
