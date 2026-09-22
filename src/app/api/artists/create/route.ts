import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, verifyOrigin, AppError } from "@/server/security";
import { saveUpload, storage } from "@/server/storage";
import { one } from "@/server/db";
import { automationCommand } from "@/server/automation";
import { audioExcerptWindows } from "@/lib/artist-style";
export async function POST(request: Request) {
  let saved: any;
  try {
    verifyOrigin(request);
    const user = await requireUser(request);
    const limit = 26 * 1024 * 1024;
    if (Number(request.headers.get("content-length")) > limit)
      throw new AppError("Maximal 25 MB für die Musikreferenz.", 413);
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("Datei fehlt.");
    let total = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new AppError("Maximal 25 MB für die Musikreferenz.", 413);
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const raw = z.string().max(30000).parse(form.get("data"));
    const input = z
      .object({ key: z.uuid(), data: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(raw));
    if (input.data.audio_consent !== true)
      throw new AppError(
        "Übermittlung der Musikreferenz an Gemini und erforderliche Rechte bestätigen.",
      );
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 25 * 1024 * 1024)
      throw new AppError("Eine Audiodatei bis 25 MB wählen.");
    saved = await saveUpload(file.name, Buffer.from(await file.arrayBuffer()));
    if (saved.kind !== "audio")
      throw new AppError("Musikreferenz muss eine gültige Audiodatei sein.");
    audioExcerptWindows(Number(saved.metadata.duration));
    const result = await automationCommand(
      user.id,
      "auto_create",
      input.data,
      input.key,
      { name: file.name, saved },
    );
    // A retried creation returns the existing artist, so discard only the unused upload.
    if (
      !(await one("SELECT id FROM assets WHERE storage_key=$1", [
        saved.storage_key,
      ]))
    )
      await storage.remove(saved.storage_key);
    saved = null;
    return NextResponse.json(result);
  } catch (e) {
    if (
      saved &&
      !(await one("SELECT id FROM assets WHERE storage_key=$1", [
        saved.storage_key,
      ]).catch(() => ({ id: true })))
    )
      await storage.remove(saved.storage_key).catch(() => {});
    return NextResponse.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
