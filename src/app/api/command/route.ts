import { NextResponse } from "next/server";
import { z } from "zod";
import { command } from "@/server/commands";
import { AppError, requireUser, verifyOrigin } from "@/server/security";
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const user = await requireUser(request);
    const raw = await request.text();
    if (raw.length > 300000) throw new AppError("Anfrage zu groß.", 413);
    return NextResponse.json(await command(user.id, JSON.parse(raw)));
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? e.issues.map((x) => x.path.join(".") + ": " + x.message).join("; ")
        : (e as Error).message;
    return NextResponse.json(
      { error: message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
