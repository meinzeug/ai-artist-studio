import { NextResponse } from "next/server";
import { requireUser, AppError } from "@/server/security";
import { connectUrl } from "@/providers/tiktok";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new AppError("Verbindung aus dem Studio starten.", 403);
    const artistId = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("artist_id"));
    return NextResponse.redirect(await connectUrl(user.id, artistId));
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
