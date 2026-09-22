export const MUSIC_CAPTION_GUIDANCE =
  "TikTok-Captions und Hashtags sind normale Musikpromotion: Songgefühl, konkrete Lyrics, Bildgeschichte, eine natürliche Frage oder ein starker Einstieg. KI, AI, Virtualität und technische Herstellung sind kein Thema der Beschreibung; keine Sätze wie 'KI-Künstler', 'virtueller Musikcharakter' oder entsprechende Hashtags. Kennzeichnungen werden separat in der Veröffentlichung verwaltet. Keine erfundene reale menschliche Biografie, Liveauftritte, Kooperationen oder Veröffentlichungstermine.";
const technicalLabel =
  /\b(?:KI|AI)\b|künstlich\w*\s+Intelligenz|KI[\s-]*(?:gestützt|generiert|Künstler|Musik)|AI[\s-]*(?:generated|artist|music)|virtuell\w*|virtual\w*/i;
export function musicCaption(
  caption: string,
  hashtags: string,
  fallback: string,
) {
  const cleanTags = (s: string) =>
    s.replace(/#[\p{L}\p{N}_-]+/gu, (tag) =>
      technicalLabel.test(tag) ? "" : tag,
    );
  const text = cleanTags(caption)
    .split(/(?<=[.!?])\s+|\n/)
    .filter((s) => !technicalLabel.test(s))
    .join("\n")
    .trim();
  return {
    caption: text || fallback,
    hashtags: cleanTags(hashtags).replace(/\s+/g, " ").trim(),
  };
}
