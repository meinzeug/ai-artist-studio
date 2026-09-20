import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { requireUser, own, AppError } from "@/server/security";
import { storage } from "@/server/storage";
import { z } from "zod";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    const asset = await own(
      user.id,
      "assets",
      z
        .string()
        .uuid()
        .parse((await params).id),
    );
    const file = storage.path(asset.storage_key),
      size = (await stat(file)).size;
    let start = 0,
      end = size - 1;
    const range = request.headers.get("range");
    if (range) {
      const m = range.match(/^bytes=(\d+)-(\d*)$/);
      if (!m)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start > end || start >= size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
    }
    const headers: Record<string, string> = {
      "Content-Type": asset.mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${new URL(request.url).searchParams.has("download") || asset.kind === "document" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
    };
    if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    return new Response(
      Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream,
      { status: range ? 206 : 200, headers },
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
