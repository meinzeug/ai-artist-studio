"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="auth">
      <h1>Das Studio konnte nicht geladen werden.</h1>
      <p>Bitte Verbindung und laufende Dienste prüfen.</p>
      <button onClick={reset}>Erneut versuchen</button>
    </main>
  );
}
