"use client";
import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  ArrowRight,
  Plus,
  Loader2,
  Copy,
  Check,
  Music2,
  Image as ImageIcon,
  Play,
} from "lucide-react";
import { statuses } from "@/lib/domain";
export type Row = Record<string, any>;
export type StudioContextType = {
  data: Row;
  artist: Row | undefined;
  artistId: string;
  setArtistId: (id: string) => void;
  nav: (page: string) => void;
  act: (action: string, data?: Row, key?: string) => Promise<any>;
  reload: () => Promise<void>;
  toast: (message: string) => void;
  busy: boolean;
};
export const StudioContext = createContext<StudioContextType>(null!);
export const useStudio = () => useContext(StudioContext);
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <Field label={label}>
      <input {...props} />
    </Field>
  );
}
export function Textarea({
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <Field label={label}>
      <textarea rows={4} {...props} />
    </Field>
  );
}
export function Select({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <Field label={label}>
      <select {...props}>{children}</select>
    </Field>
  );
}
export function Badge({ status, label }: { status?: string; label?: string }) {
  return (
    <span className={"badge " + (status ?? "")}>
      {label ?? statuses[status ?? ""] ?? status}
    </span>
  );
}
export function Empty({
  title,
  body,
  action,
  onClick,
}: {
  title: string;
  body: string;
  action?: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">
        <Music2 size={26} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action && (
        <button className="primary" onClick={onClick}>
          <Plus size={16} />
          {action}
        </button>
      )}
    </div>
  );
}
export function SectionHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={"modal " + (wide ? "wide" : "")}
          aria-describedby={description ? "modal-desc" : undefined}
        >
          <div className="modal-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description id="modal-desc">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="icon" aria-label="Schließen">
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Submit({ children = "Speichern" }: { children?: ReactNode }) {
  const { busy } = useStudio();
  return (
    <button className="primary" type="submit" disabled={busy}>
      {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}{" "}
      {children}
    </button>
  );
}
export function CopyButton({
  value,
  label = "Kopieren",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="subtle"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
      {copied ? "Kopiert" : label}
    </button>
  );
}
export function Preview({
  asset,
  compact = false,
}: {
  asset?: Row;
  compact?: boolean;
}) {
  const { data } = useStudio();
  const [openedVideo, setOpenedVideo] = useState(false);
  const cover = asset
    ? data.assets.find(
        (a: Row) => a.parent_id === asset.id && a.metadata.role === "cover",
      )
    : null;
  if (!asset)
    return (
      <div className="media-placeholder">
        <ImageIcon />
      </div>
    );
  const src = "/api/assets/" + asset.id;
  if (asset.kind === "image")
    return (
      <img
        className={"asset-preview " + (compact ? "compact" : "")}
        src={src}
        alt={asset.name}
      />
    );
  if (asset.kind === "video" && !openedVideo)
    return (
      <button
        className={"video-poster " + (compact ? "compact" : "")}
        aria-label={"Video abspielen: " + asset.name}
        onClick={() => setOpenedVideo(true)}
      >
        {cover ? (
          <img src={"/api/assets/" + cover.id} alt={asset.name} />
        ) : (
          <span>Videovorschau</span>
        )}
        <span className="video-play">
          <Play size={24} fill="currentColor" />
        </span>
      </button>
    );
  if (asset.kind === "video")
    return (
      <video
        className={"asset-preview " + (compact ? "compact" : "")}
        controls
        autoPlay
        preload="auto"
        playsInline
        poster={cover ? "/api/assets/" + cover.id : undefined}
        src={src}
      />
    );
  if (asset.kind === "audio")
    return (
      <div className="audio-preview">
        <Music2 />
        <audio controls preload="metadata" src={src} />
      </div>
    );
  return <a href={src + "?download"}>Nachweis herunterladen</a>;
}
export function Form({
  children,
  onSubmit,
  className = "form",
}: {
  children: ReactNode;
  onSubmit: (data: Row) => Promise<void>;
  className?: string;
}) {
  return (
    <form
      className={className}
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const values = Object.fromEntries(new FormData(e.currentTarget));
        await onSubmit(values);
      }}
    >
      {children}
    </form>
  );
}
export function ArtistRequired({ children }: { children: ReactNode }) {
  const { artist, nav } = useStudio();
  return artist ? (
    <>{children}</>
  ) : (
    <Empty
      title="Dein Studio beginnt mit einem Künstler"
      body="Lege die musikalische und visuelle Identität an. Danach stehen alle Produktionsbereiche bereit."
      action="Künstler anlegen"
      onClick={() => nav("artists")}
    />
  );
}
export const formatDate = (date: string | null, zone = "Europe/Berlin") =>
  date
    ? new Intl.DateTimeFormat("de-DE", {
        timeZone: zone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(date))
    : "Noch nicht geplant";
export function NextLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowRight size={15} />
    </button>
  );
}
