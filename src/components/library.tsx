"use client";
import { useState } from "react";
import {
  Upload,
  Search,
  Download,
  ShieldCheck,
  Image as ImageIcon,
  Music2,
  FileText,
  Check,
} from "lucide-react";
import {
  useStudio,
  SectionHead,
  Empty,
  Modal,
  Form,
  Input,
  Textarea,
  Select,
  Submit,
  Badge,
  ArtistRequired,
  Preview,
  type Row,
  formatDate,
} from "./ui";
export function Library() {
  const { data, artistId, act, reload, toast } = useStudio();
  const [upload, setUpload] = useState(false),
    [detail, setDetail] = useState<Row | null>(null),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const assets = data.assets.filter(
    (a: Row) =>
      a.artist_id === artistId &&
      (filter === "all" || a.kind === filter) &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const active = detail
    ? data.assets.find((a: Row) => a.id === detail.id)
    : null;
  return (
    <>
      <SectionHead
        eyebrow="DEIN KREATIVES MATERIAL"
        title="Alles für deinen Künstler."
        description="Charakterreferenzen, Aufnahmen und fertige Videos. Mit nachvollziehbarer Herkunft."
      >
        <button className="primary" onClick={() => setUpload(true)}>
          <Upload size={16} />
          Datei importieren
        </button>
      </SectionHead>
      <ArtistRequired>
        <div className="toolbar">
          <div className="tabs">
            {[
              ["all", "Alle Medien"],
              ["image", "Bilder"],
              ["audio", "Audio"],
              ["video", "Videos"],
              ["document", "Nachweise"],
            ].map(([k, l]) => (
              <button
                key={k}
                className={filter === k ? "selected" : ""}
                onClick={() => setFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="search-field">
            <Search size={16} />
            <input
              aria-label="Medien durchsuchen"
              placeholder="Medien suchen …"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {assets.length ? (
          <div className="media-grid">
            {assets.map((a: Row) => (
              <article className="media-card" key={a.id}>
                <button
                  className="media-card-image"
                  onClick={() => setDetail(a)}
                >
                  {a.kind === "image" ? (
                    <img src={"/api/assets/" + a.id} alt={a.name} />
                  ) : a.kind === "video" ? (
                    <video
                      src={"/api/assets/" + a.id + "#t=0.1"}
                      preload="metadata"
                    />
                  ) : a.kind === "audio" ? (
                    <div className="audio-tile">
                      <Music2 size={40} />
                      <div className="decorative-bars">
                        {Array.from({ length: 18 }, (_, i) => (
                          <i
                            style={{
                              height: 15 + (Math.cos(i) * 0.5 + 0.5) * 55,
                            }}
                            key={i}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <FileText size={40} />
                  )}
                  <span className="media-type">{a.kind.toUpperCase()}</span>
                </button>
                <div className="media-card-info">
                  <button className="title-button" onClick={() => setDetail(a)}>
                    {a.name}
                  </button>
                  <small>
                    {(Number(a.bytes) / 1024 / 1024).toFixed(1)} MB ·{" "}
                    {a.metadata.width
                      ? `${a.metadata.width} × ${a.metadata.height}`
                      : a.metadata.duration
                        ? `${Number(a.metadata.duration).toFixed(1)} s`
                        : "Dokument"}
                  </small>
                  <Badge status={a.rights_status} />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Deine Medien finden hier ein Zuhause"
            body="Importiere Charakterbilder, Cover, rechtmäßig bezogene Audioaufnahmen oder Videomaterial. Ohne externen Generierungsanbieter vollständig nutzbar."
            action="Erste Datei importieren"
            onClick={() => setUpload(true)}
          />
        )}
        <div className="info-bar">
          <ImageIcon size={17} />
          Bild- und Videogenerierung: kein Provider eingerichtet. Referenzbilder
          und ein Seed garantieren kein identisches Gesicht. Upload und lokale
          Produktion sind verfügbar.
        </div>
      </ArtistRequired>
      {upload && <UploadDialog onClose={() => setUpload(false)} />}
      {active && (
        <Modal
          title={active.name}
          description="Originaldatei und Herkunft. Rechtefreigaben sind Entscheidungen des Betreibers anhand hinterlegter Nachweise."
          onClose={() => setDetail(null)}
          wide
        >
          <div className="detail-grid">
            <div>
              <Preview asset={active} />
              <dl>
                <dt>Importiert</dt>
                <dd>{formatDate(active.created_at)}</dd>
                <dt>Herkunft</dt>
                <dd>{active.origin}</dd>
                <dt>SHA-256</dt>
                <dd className="hash">{active.sha256}</dd>
                <dt>Technische Eigenschaften</dt>
                <dd>
                  {active.metadata.duration &&
                    `${Number(active.metadata.duration).toFixed(2)} s · `}
                  {active.mime}
                  {active.metadata.streams?.map((s: Row, i: number) => (
                    <div key={i}>
                      {s.codec} ·{" "}
                      {s.width
                        ? `${s.width} × ${s.height}`
                        : `${s.sample_rate} Hz · ${s.channels} Kanäle`}
                    </div>
                  ))}
                </dd>
              </dl>
              <a
                className="button"
                href={"/api/assets/" + active.id + "?download"}
              >
                <Download size={16} />
                Original herunterladen
              </a>
              {["image", "audio"].includes(active.kind) && (
                <Form
                  onSubmit={async (v) => {
                    await act("add_reference", {
                      artist_id: artistId,
                      asset_id: active.id,
                      type: v.type,
                      notes: v.notes,
                    });
                  }}
                >
                  <h3>Als Künstlerreferenz vorschlagen</h3>
                  <Select name="type" label="Referenzart">
                    {(active.kind === "image"
                      ? [
                          ["portrait", "Hauptporträt"],
                          ["outfit", "Outfit"],
                          ["visual", "Visuelle Referenz"],
                        ]
                      : [
                          ["voice", "Stimme"],
                          ["song", "Referenzsong"],
                        ]
                    ).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Textarea name="notes" label="Vergleich & Anmerkungen" />
                  <Submit>Referenz vorschlagen</Submit>
                </Form>
              )}
              {data.artist_references
                .filter((r: Row) => r.asset_id === active.id)
                .map((r: Row) => (
                  <div className="reference-row" key={r.id}>
                    <strong>{r.type}</strong>
                    <Badge status={r.state} />
                    <p>{r.notes}</p>
                    {r.state === "proposed" && (
                      <div className="actions">
                        <button
                          onClick={() =>
                            act("approve_reference", {
                              id: r.id,
                              state: "approved",
                            })
                          }
                        >
                          Nach Vergleich freigeben
                        </button>
                        <button
                          onClick={() =>
                            act("approve_reference", {
                              id: r.id,
                              state: "rejected",
                            })
                          }
                        >
                          Ablehnen
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
            <RightsForm asset={active} />
          </div>
        </Modal>
      )}
    </>
  );
}
function UploadDialog({ onClose }: { onClose: () => void }) {
  const { data, artistId, reload, toast } = useStudio();
  const [song, setSong] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const songs = data.songs.filter((s: Row) => s.artist_id === artistId);
  return (
    <Modal
      title="Medien importieren"
      description="Originale bleiben unverändert. Dateityp und Inhalt werden geprüft. Maximal 250 MB pro Datei."
      onClose={onClose}
    >
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const form = new FormData(e.currentTarget);
            form.set("artist_id", artistId);
            if (!song) {
              form.delete("song_id");
              form.delete("order_id");
            }
            const date = form.get("generated_at");
            if (date)
              form.set("generated_at", new Date(String(date)).toISOString());
            const r = await fetch("/api/upload", {
              method: "POST",
              body: form,
            });
            const value = await r.json();
            if (!r.ok) throw new Error(value.error);
            await reload();
            toast("Datei importiert. Audioanalyse läuft im Hintergrund.");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="upload-zone">
          <Upload size={30} />
          <strong>Datei auswählen</strong>
          <span>Bilder · Audio · Video · PDF-Nachweise</span>
          <input
            type="file"
            name="file"
            accept="image/png,image/jpeg,image/webp,audio/*,video/mp4,video/webm,application/pdf"
            required
          />
        </label>
        <Select
          label="Song zuordnen (bei Audio empfohlen)"
          name="song_id"
          value={song}
          onChange={(e) => setSong(e.target.value)}
        >
          <option value="">Nur dem Künstler zuordnen</option>
          {songs.map((s: Row) => (
            <option value={s.id} key={s.id}>
              {s.title}
            </option>
          ))}
        </Select>
        {song && (
          <>
            <Select label="Suno-Produktionsauftrag" name="order_id">
              <option value="">Ohne Produktionsauftrag</option>
              {data.music_orders
                .filter((o: Row) => o.song_id === song)
                .map((o: Row) => (
                  <option value={o.id} key={o.id}>
                    {o.production_number} · {o.package.title}
                  </option>
                ))}
            </Select>
            <Select
              label="Lyrics-Version (falls ohne Auftrag)"
              name="lyrics_version_id"
            >
              <option value="">Noch nicht zugeordnet</option>
              {data.lyrics_versions
                .filter((v: Row) => v.song_id === song)
                .map((v: Row) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version}
                  </option>
                ))}
            </Select>
          </>
        )}
        <Input
          label="Herkunft / Downloadweg"
          name="origin"
          placeholder="Zum Beispiel: Suno, Download aus eigenem Konto"
          required
        />
        <details>
          <summary>Generierungsinformationen (soweit bekannt)</summary>
          <div className="form">
            <Input
              label="Suno-Link / externe URL"
              name="external_url"
              type="url"
            />
            <Input label="Externe Kennung" name="external_id" />
            <Input
              label="Herstellungsdatum"
              name="generated_at"
              type="datetime-local"
            />
            <Input label="Modellbezeichnung" name="model" />
            <Textarea
              label="Bekannte Einstellungen"
              name="generation_settings"
            />
          </div>
        </details>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Wird importiert …" : "Datei importieren"}
        </button>
      </form>
    </Modal>
  );
}
export function RightsForm({ asset }: { asset: Row }) {
  const { data, act } = useStudio();
  const record = data.rights_records.find((r: Row) => r.asset_id === asset.id);
  return (
    <div className="panel">
      <h3>
        <ShieldCheck size={18} /> Herkunft & Rechte
      </h3>
      <Form
        key={record?.id ?? asset.id}
        onSubmit={async (v) => {
          await act("save_rights", {
            asset_id: asset.id,
            ...v,
            evidence_asset_id: v.evidence_asset_id || null,
          });
        }}
      >
        <Select
          label="Nutzungsstatus"
          name="status"
          defaultValue={asset.rights_status}
        >
          <option value="unclear">Ungeklärt</option>
          <option value="noncommercial">Nur nichtkommerziell</option>
          <option value="operator_approved">
            Vom Betreiber anhand Nachweisen freigegeben
          </option>
          <option value="disputed">Gesperrt / streitig</option>
        </Select>
        <Input
          label="Anbieter"
          name="provider"
          defaultValue={record?.provider ?? ""}
        />
        <Input
          label="Tarif bei Erstellung"
          name="plan"
          defaultValue={record?.plan ?? ""}
        />
        <Textarea
          label="Herkunft der Eingaben / Bilder / Stimmen / Samples"
          name="input_origin"
          defaultValue={record?.input_origin ?? ""}
        />
        <Input
          label="Bezugs- bzw. Downloadweg"
          name="acquisition"
          defaultValue={record?.acquisition ?? asset.origin}
        />
        <Input
          label="Bedingungen (URL)"
          name="terms_url"
          type="url"
          defaultValue={record?.terms_url ?? ""}
        />
        <Input
          label="Stand der Bedingungen"
          name="terms_date"
          type="date"
          defaultValue={record?.terms_date ?? ""}
        />
        <Select
          label="Hinterlegter Nachweis"
          name="evidence_asset_id"
          defaultValue={record?.evidence_asset_id ?? ""}
        >
          <option value="">Kein Dokument zugeordnet</option>
          {data.assets
            .filter(
              (a: Row) =>
                a.artist_id === asset.artist_id && a.kind === "document",
            )
            .map((a: Row) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </Select>
        <Textarea
          label="Begründung, kommerzielle Nutzung & offene Fragen"
          name="notes"
          defaultValue={record?.notes ?? ""}
          required
        />
        <p className="muted">
          Kommerzielle Erlaubnis und urheberrechtlicher Schutz sind getrennt.
          Bei Covers, Remixes, Samples und realen Stimmen zusätzliche Rechte
          prüfen.
        </p>
        <Submit>Rechtestatus dokumentieren</Submit>
      </Form>
    </div>
  );
}
