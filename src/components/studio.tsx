"use client";
import { SunoConnectionCard } from "./suno";
import { useState, useEffect, useCallback } from "react";
import {
  AudioLines,
  LayoutDashboard,
  Users,
  Lightbulb,
  NotebookPen,
  Disc3,
  Images,
  Clapperboard,
  CalendarDays,
  ShieldCheck,
  MessagesSquare,
  ChartNoAxesCombined,
  Sparkles,
  Settings2,
  Menu,
  LogOut,
  ChevronDown,
  ArrowUpRight,
  Plus,
  CheckCircle2,
  Clock3,
  ArrowRight,
  X,
  OctagonPause,
  ListTodo,
} from "lucide-react";
import {
  StudioContext,
  type Row,
  SectionHead,
  Empty,
  Badge,
  NextLink,
} from "./ui";
import { Artists, Ideas } from "./artists";
import { Lyrics, MusicProduction } from "./songs";
import { Library } from "./library";
import { VideoStudio } from "./video";
import { Publishing, Campaigns } from "./publishing";
import { Community, Analytics, Director } from "./intelligence";
import { Settings } from "./settings";
import { ManualTasks, AutomationOverview } from "./automation";
const navigation = [
  ["overview", "Übersicht", LayoutDashboard],
  ["artists", "Künstler", Users],
  ["tasks", "Manuelle Aufgaben", ListTodo],
  ["ideas", "Ideen & Recherche", Lightbulb],
  ["lyrics", "Songs & Lyrics", NotebookPen],
  ["music", "Musikproduktion", Disc3],
  ["library", "Charakter & Medien", Images],
  ["video", "Video-Studio", Clapperboard],
  ["campaigns", "Kampagnen & Kalender", CalendarDays],
  ["publishing", "Freigaben & Export", ShieldCheck],
  ["community", "Community", MessagesSquare],
  ["analytics", "Auswertung", ChartNoAxesCombined],
  ["director", "KI-Director", Sparkles],
  ["settings", "Jobs & Einstellungen", Settings2],
] as const;
export default function Studio() {
  const [auth, setAuth] = useState<any>(null),
    [data, setData] = useState<Row | null>(null),
    [page, setPage] = useState("overview"),
    [artistId, setArtistId] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const toast = useCallback((s: string) => {
    setNotice(s);
    setTimeout(() => setNotice(""), 5000);
  }, []);
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/state");
      const value = await r.json();
      if (!r.ok) {
        if (r.status === 401) {
          setAuth({ user: null });
          setData(null);
          return;
        }
        throw new Error(value.error);
      }
      setData(value);
      setArtistId((id) =>
        id && value.artists.some((a: Row) => a.id === id)
          ? id
          : (value.artists.find((a: Row) => !a.archived)?.id ?? ""),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((a) => {
        setAuth(a);
        if (a.user) void reload();
      })
      .catch(() => setError("Studio nicht erreichbar."));
    const h = window.location.hash.slice(1);
    if (navigation.some((n) => n[0] === h)) setPage(h);
  }, [reload]);
  useEffect(() => {
    if (!auth?.user) return;
    const timer = setInterval(() => void reload(), 6000);
    return () => clearInterval(timer);
  }, [auth?.user, reload]);
  const nav = (p: string) => {
    setPage(p);
    window.location.hash = p;
    setMobile(false);
  };
  const act = async (action: string, payload: Row = {}, key?: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          data: payload,
          key: key ?? crypto.randomUUID(),
        }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await reload();
      toast(
        action.startsWith("queue") || action === "render_video"
          ? "Auftrag eingereiht. Fortschritt unter Jobs."
          : "Gespeichert.",
      );
      return v;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  if (!auth)
    return (
      <div className="loading-screen">
        <AudioLines size={42} />
        <p>Studio wird geladen …</p>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  if (!auth.user)
    return (
      <div className="auth-screen">
        <div className="auth-art">
          <div className="wordmark">
            <AudioLines /> artist<span>studio</span>
          </div>
          <div className="auth-copy">
            <div className="eyebrow">DEINE IDEEN. DEIN SOUND.</div>
            <h1>
              Aus einer Idee
              <br />
              wird ein Künstler.
            </h1>
            <p>
              Ein privates Zuhause für deine Musik.
              <br />
              Von der ersten Zeile bis zum fertigen Video.
            </p>
          </div>
          <div className="record-art">
            <div className="record-label">
              <AudioLines size={42} />
              <span>
                CREATE
                <br />
                SOMETHING
                <br />
                YOURS.
              </span>
            </div>
          </div>
          <small>SELBST GEHOSTET · DEIN KREATIVER FREIRAUM</small>
        </div>
        <div className="auth-form">
          <div className="eyebrow">AI ARTIST STUDIO</div>
          <h2>
            {auth.needsSetup
              ? "Willkommen in deinem Studio."
              : "Schön, dass du da bist."}
          </h2>
          <p>
            {auth.needsSetup
              ? "Richte dein Betreiberkonto ein. Zugangsdaten bleiben auf diesem Server."
              : "Melde dich an und arbeite an deinem nächsten Release."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: auth.needsSetup ? "setup" : "login",
                    email: f.get("email"),
                    password: f.get("password"),
                    setup_token: f.get("setup_token") || undefined,
                  }),
                });
                const v = await r.json();
                if (!r.ok) throw new Error(v.error);
                const a = await (await fetch("/api/auth")).json();
                setAuth(a);
                await reload();
                nav(auth.needsSetup ? "settings" : "overview");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              E-Mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Passwort
              <input
                name="password"
                type="password"
                minLength={auth.needsSetup ? 12 : 1}
                autoComplete={
                  auth.needsSetup ? "new-password" : "current-password"
                }
                required
              />
            </label>
            {auth.needsSetup && auth.setupTokenRequired && (
              <label>
                Einrichtungscode
                <input
                  name="setup_token"
                  type="password"
                  required
                  autoComplete="off"
                />
                <small>
                  Der einmalige Code schützt die Ersteinrichtung dieses Servers.
                </small>
              </label>
            )}
            {auth.needsSetup && (
              <small>
                Mindestens 12 Zeichen. Keine voreingestellten Zugangsdaten.
              </small>
            )}
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Einen Moment …"
                : auth.needsSetup
                  ? "Studio einrichten"
                  : "Studio öffnen"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-note">
            <ShieldCheck size={18} /> Privat. Geschützt. Unter deiner Kontrolle.
          </div>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="loading-screen">
        <AudioLines />
        <p>Produktionen werden geladen …</p>
        {error && (
          <>
            <p role="alert">{error}</p>
            <button onClick={() => void reload()}>Erneut laden</button>
          </>
        )}
      </div>
    );
  const artist = data.artists.find((a: Row) => a.id === artistId);
  const pending = data.posts.filter(
    (p: Row) => p.status === "waiting_for_approval",
  ).length;
  const active = data.jobs.filter((j: Row) =>
    ["queued", "running"].includes(j.state),
  ).length;
  const components: Record<string, React.ReactNode> = {
    artists: <Artists />,
    tasks: <ManualTasks />,
    ideas: <Ideas />,
    lyrics: <Lyrics />,
    music: <MusicProduction />,
    library: <Library />,
    video: <VideoStudio />,
    campaigns: <Campaigns />,
    publishing: <Publishing />,
    community: <Community />,
    analytics: <Analytics />,
    director: <Director />,
    settings: <Settings />,
  };
  return (
    <StudioContext.Provider
      value={{
        data,
        artist,
        artistId,
        setArtistId,
        nav,
        act,
        reload,
        toast,
        busy,
      }}
    >
      <div className="app-shell">
        <aside className={"sidebar " + (mobile ? "open" : "")}>
          <a
            className="wordmark"
            href="#overview"
            onClick={() => nav("overview")}
          >
            <span className="logo-mark">
              <AudioLines size={23} />
            </span>
            <span>
              artist<span className="light">studio</span>
              <small>YOUR CREATIVE WORKSPACE</small>
            </span>
          </a>
          <div className="workspace-select">
            <span className="workspace-avatar">
              {data.settings.studio_name.slice(0, 1)}
            </span>
            <div>
              <strong>{data.settings.studio_name}</strong>
              <small>Privates Studio</small>
            </div>
            <ChevronDown size={15} />
          </div>
          <div className="nav-caption">WORKSPACE</div>
          <nav>
            {navigation.map(([key, label, Icon], i) => (
              <div key={key}>
                {key === "campaigns" && (
                  <div className="nav-caption second">
                    VERÖFFENTLICHEN & LERNEN
                  </div>
                )}
                {key === "settings" && <div className="nav-separator" />}
                <button
                  className={page === key ? "active" : ""}
                  onClick={() => nav(key)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {key === "publishing" && pending > 0 && <b>{pending}</b>}
                  {key === "settings" && active > 0 && <b>{active}</b>}
                  {key === "tasks" &&
                    data.manual_tasks.some((t: Row) => t.state === "open") && (
                      <b>
                        {
                          data.manual_tasks.filter(
                            (t: Row) => t.state === "open",
                          ).length
                        }
                      </b>
                    )}
                </button>
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="connection-dot" />
            <span>Lokal & privat</span>
            <button
              className="icon"
              aria-label="Abmelden"
              onClick={async () => {
                await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: '{"action":"logout"}',
                });
                setAuth({ user: null });
                setData(null);
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </aside>
        {mobile && (
          <div className="mobile-shade" onClick={() => setMobile(false)} />
        )}
        <div className="main-wrap">
          <header className="topbar">
            <button
              className="icon mobile-menu"
              aria-label="Menü öffnen"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              Workspace <span>/</span>
              <strong>{navigation.find((n) => n[0] === page)?.[1]}</strong>
            </div>
            <div className="top-actions">
              <span className="mode-indicator">
                <span />
                {data.settings.emergency_stop
                  ? "Not-Aus aktiv"
                  : data.artist_automations.some(
                        (p: Row) => p.artist_id === artistId && p.enabled,
                      )
                    ? "Künstlerautomatik aktiv"
                    : data.settings.mode === "assisted"
                      ? "Assistierter Betrieb"
                      : data.settings.mode === "production"
                        ? "Produktionsautomatik"
                        : "Veröffentlichungsprüfung"}
              </span>
              <select
                aria-label="Aktiver Künstler"
                value={artistId}
                onChange={(e) => setArtistId(e.target.value)}
              >
                <option value="">Künstler auswählen</option>
                {data.artists.map((a: Row) => (
                  <option value={a.id} key={a.id}>
                    {a.name}
                    {a.archived ? " (Archiv)" : ""}
                  </option>
                ))}
              </select>
              <button
                className="user-avatar"
                title={data.user.email}
                onClick={() => nav("settings")}
              >
                {data.user.email.slice(0, 1).toUpperCase()}
              </button>
            </div>
          </header>
          {data.settings.emergency_stop && (
            <div className="stop-banner">
              <OctagonPause size={18} /> Not-Aus aktiv. Neue Produktionen sind
              angehalten.{" "}
              <button onClick={() => nav("settings")}>Einstellungen</button>
            </div>
          )}
          <main className="content">
            {error && (
              <div className="error" role="alert">
                {error}
                <button
                  className="icon"
                  aria-label="Fehler schließen"
                  onClick={() => setError("")}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            {page === "overview" ? (
              <Overview data={data} artist={artist} nav={nav} />
            ) : (
              components[page]
            )}
          </main>
          <footer className="app-footer">
            <span>DEIN STUDIO. DEINE ENTSCHEIDUNGEN.</span>
            <span>Europe/Berlin · v0.1</span>
          </footer>
        </div>
        {notice && (
          <div className="toast" role="status">
            <CheckCircle2 size={18} />
            {notice}
          </div>
        )}
      </div>
    </StudioContext.Provider>
  );
}
function Overview({
  data,
  artist,
  nav,
}: {
  data: Row;
  artist?: Row;
  nav: (p: string) => void;
}) {
  const artists = data.artists.filter((a: Row) => !a.archived),
    songs = data.songs.filter((s: Row) => !artist || s.artist_id === artist.id),
    posts = data.posts.filter((p: Row) => !artist || p.artist_id === artist.id);
  const steps = [
    ["artists", "Künstler", artists.length],
    ["ideas", "Songidee", data.ideas.length],
    ["lyrics", "Lyrics", data.lyrics_versions.length],
    ["music", "Audio", data.audio_variants.length],
    [
      "video",
      "Video",
      data.renders.filter((r: Row) => r.state === "succeeded").length,
    ],
    [
      "publishing",
      "Release",
      posts.filter((p: Row) => p.status === "published").length,
    ],
  ];
  return (
    <>
      <SectionHead
        eyebrow="DEIN KREATIVER FREIRAUM"
        title="Willkommen im Studio."
        description="Gute Musik beginnt mit einer Idee. Mach etwas daraus."
      >
        <button className="primary" onClick={() => nav("director")}>
          <Sparkles size={16} />
          KI-Director öffnen
        </button>
      </SectionHead>
      <AutomationOverview />
      <SunoConnectionCard />
      <div className="studio-hero">
        <div className="hero-copy">
          <span className="pill">
            <span /> VON DER IDEE ZUM RELEASE
          </span>
          <h2>
            Dein nächster Sound.
            <br />
            <em>Deine nächste Geschichte.</em>
          </h2>
          <p>
            Entwickle Künstler mit Charakter, schreibe Songs
            <br className="desktop-only" /> und bring deine Musik in Bewegung.
          </p>
          <button
            className="light-button"
            onClick={() => nav(artists.length ? "ideas" : "artists")}
          >
            {artists.length
              ? "Neue Songidee entwickeln"
              : "Ersten Künstler entwickeln"}
            <ArrowUpRight size={17} />
          </button>
        </div>
        <div className="hero-vinyl">
          <div className="vinyl-center">
            <AudioLines size={36} />
            <span>
              SIDE A<br />
              THE NEXT CHAPTER
            </span>
          </div>
          <div className="orbit-label">MADE BY YOU · POWERED BY IDEAS</div>
        </div>
        <div className="hero-bars">
          {Array.from({ length: 34 }, (_, i) => (
            <i key={i} style={{ height: 12 + (Math.sin(i * 0.8) + 1) * 25 }} />
          ))}
        </div>
      </div>
      <div className="stats-grid">
        {[
          [Users, "Künstler", artists.length, "Eigenständige Identitäten"],
          [Disc3, "Songs in Arbeit", songs.length, "Von der Idee zum Master"],
          [
            Clapperboard,
            "Fertige Videos",
            data.renders.filter((r: Row) => r.state === "succeeded").length,
            "Bereit für den nächsten Schritt",
          ],
          [
            ShieldCheck,
            "Offene Freigaben",
            posts.filter((p: Row) => p.status === "waiting_for_approval")
              .length,
            "Deine Entscheidung zählt",
          ],
        ].map(([Icon, label, note, sub]: any) => (
          <div className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>{note}</strong>
            <small>{sub}</small>
          </div>
        ))}
      </div>
      <div className="panel workflow">
        <div className="panel-heading">
          <div>
            <h3>Dein Produktionsweg</h3>
            <p>Ein kreativer Prozess. Alles an einem Ort.</p>
          </div>
          <span className="muted">
            {steps.filter((s) => Number(s[2]) > 0).length} / 6 Schritte
            gestartet
          </span>
        </div>
        <div className="workflow-steps">
          {steps.map(([key, label, n], i) => (
            <button
              key={key}
              onClick={() => nav(String(key))}
              className={Number(n) > 0 ? "done" : ""}
            >
              <span className="step-num">
                {Number(n) > 0 ? (
                  <CheckCircle2 size={20} />
                ) : (
                  String(i + 1).padStart(2, "0")
                )}
              </span>
              <strong>{label}</strong>
              <small>{Number(n) > 0 ? `${n} vorhanden` : "Loslegen"}</small>
              {i < 5 && <ArrowRight className="step-arrow" size={15} />}
            </button>
          ))}
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h3>Deine Künstler</h3>
            <NextLink onClick={() => nav("artists")}>Alle ansehen</NextLink>
          </div>
          {artists.length ? (
            <div className="artist-mini-list">
              {artists.slice(0, 3).map((a: Row) => (
                <button
                  key={a.id}
                  className="artist-mini"
                  onClick={() => nav("artists")}
                >
                  <span
                    className="artist-monogram"
                    style={{
                      background: `linear-gradient(135deg,${a.color}90,#28252e)`,
                    }}
                  >
                    {a.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{a.name}</strong>
                    <small>
                      {a.genre || "Musikalische Identität entwickeln"}
                    </small>
                  </span>
                  <Badge label="Virtueller Künstler" />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Eine neue Stimme wartet auf dich"
              body="Gib deinem ersten virtuellen Künstler eine Identität und einen eigenen Sound."
              action="Künstler anlegen"
              onClick={() => nav("artists")}
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h3>Als Nächstes</h3>
            <Clock3 size={18} />
          </div>
          <div
            className="next-action"
            onClick={() => nav("settings")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && nav("settings")}
          >
            <span className="action-icon">
              <Sparkles size={20} />
            </span>
            <div>
              <strong>
                {data.providers.some((p: Row) => p.state === "connected")
                  ? "KI ist verbunden"
                  : "KI-Verbindung einrichten"}
              </strong>
              <p>
                {data.providers.some((p: Row) => p.state === "connected")
                  ? "Ideen, Texte und Storyboards entwickeln."
                  : "Codex oder Gemini im Studio testen."}
              </p>
            </div>
            <ArrowUpRight size={17} />
          </div>
          <div
            className="next-action"
            onClick={() => nav("publishing")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && nav("publishing")}
          >
            <span className="action-icon">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Du gibst den Ton an</strong>
              <p>
                Rechte prüfen, Inhalte freigeben und als fertiges TikTok-Paket
                exportieren.
              </p>
            </div>
            <ArrowUpRight size={17} />
          </div>
          <div className="studio-note">
            <span className="connection-dot" /> Exporte funktionieren ohne
            Posting-API.
          </div>
        </section>
      </div>
    </>
  );
}
