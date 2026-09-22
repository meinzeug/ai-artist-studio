"use client";
import { useStudio, Modal, type Row, formatDate } from "./ui";
export function ArtistStyle({
  artist,
  onClose,
}: {
  artist: Row;
  onClose: () => void;
}) {
  const { data, act, nav } = useStudio();
  const p = data.artist_style_profiles?.find(
    (x: Row) => x.artist_id === artist.id,
  );
  return (
    <Modal
      title={`Musikalische Grundlage · ${artist.name}`}
      onClose={onClose}
      wide
    >
      {!p ? (
        <p>
          Keine zusätzliche Recherche oder Audiodatei hinterlegt. Das
          Musikprofil beruht auf deinen Vorgaben.
        </p>
      ) : (
        <>
          {p.research_query && (
            <section>
              <h3>Stilrecherche</h3>
              <p>{p.research_query}</p>
              <Result
                result={p.research_result}
                job={data.jobs.find((j: Row) => j.id === p.research_job_id)}
              />
              {p.research_result?.sources?.map((source: Row, i: number) => (
                <p key={i}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <br />
                  {source.finding}
                </p>
              ))}
              {p.research_result?.creative_direction && (
                <p>{p.research_result.creative_direction}</p>
              )}
            </section>
          )}
          {p.reference_asset_id && (
            <section>
              <h3>Musikreferenz</h3>
              <audio
                controls
                preload="none"
                src={`/api/assets/${p.reference_asset_id}`}
              />
              <Result
                result={p.audio_result}
                job={data.jobs.find((j: Row) => j.id === p.audio_job_id)}
              />
              {p.audio_result?.excerpt_windows && (
                <p className="muted">
                  Analysierte Ausschnitte:{" "}
                  {p.audio_result.excerpt_windows
                    .map(
                      (w: Row) =>
                        `${w.start.toFixed(1)}–${(w.start + w.duration).toFixed(1)} s`,
                    )
                    .join(", ")}
                  . Original unverändert.
                </p>
              )}
              {!p.audio_result &&
                data.jobs.some(
                  (j: Row) =>
                    j.id === p.audio_job_id &&
                    ["failed", "cancelled"].includes(j.state),
                ) && (
                  <button
                    onClick={async () => {
                      if (
                        await act("auto_style_skip", {
                          artist_id: artist.id,
                          version: p.version,
                        })
                      ) {
                        onClose();
                        nav("tasks");
                      }
                    }}
                  >
                    Ohne Höranalyse fortfahren
                  </button>
                )}
            </section>
          )}
          <p className="muted">
            Quellen und Audioanalyse sind Grundlagen für kreative
            Entscheidungen. Stilähnlichkeit ist keine Garantie für eine
            bestimmte Aufnahme oder Stimme.
          </p>
          <button
            onClick={() => {
              onClose();
              nav("tasks");
            }}
          >
            Produktion & manuelle Aufgaben öffnen
          </button>
        </>
      )}
    </Modal>
  );
}
function Result({ result, job }: { result?: Row; job?: Row }) {
  if (!result)
    return (
      <p className={job?.error ? "error" : "muted"}>
        {job?.error ??
          (job
            ? "Analyse läuft oder wartet auf Ausführung."
            : "Analyse wird vorbereitet.")}
      </p>
    );
  return (
    <>
      <p>{result.summary}</p>
      {result.style_prompt && (
        <>
          <h4>Musikalische Richtung</h4>
          <p>{result.style_prompt}</p>
        </>
      )}
      <p className="muted">{result.uncertainty}</p>
      {result.checked_at && (
        <small>
          {result.provider} · {formatDate(result.checked_at)}
        </small>
      )}
    </>
  );
}
