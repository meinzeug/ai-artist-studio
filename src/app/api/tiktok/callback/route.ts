import { NextResponse } from "next/server";
import { requireUser, AppError } from "@/server/security";
import { completeOAuth } from "@/providers/tiktok";
import { z } from "zod";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request),
      params = new URL(request.url).searchParams;
    await completeOAuth(
      user.id,
      z.string().min(32).max(200).parse(params.get("state")),
      z.string().min(1).max(2000).parse(params.get("code")),
    );
    return NextResponse.redirect(
      (process.env.APP_ORIGIN ?? "http://127.0.0.1:3210") + "/#settings",
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
