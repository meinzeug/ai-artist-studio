import { query } from "@/server/db";
import { requireUser, AppError, verifyOrigin, audit } from "@/server/security";
export async function GET(request: Request) {
  try {
    await requireUser(request);
    const r = await fetch(
      (process.env.RUNNER_URL ?? "http://127.0.0.1:3211") + "/health",
      {
        headers: { Authorization: "Bearer " + process.env.RUNNER_TOKEN },
        signal: AbortSignal.timeout(15000),
      },
    );
    return Response.json(await r.json());
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "CLI-Runner nicht erreichbar. Separaten Runner starten.",
      },
      { status: e instanceof AppError ? e.status : 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const user = await requireUser(request);
    if (user.role !== "owner")
      throw new AppError("Nur der Betreiber kann CLI-Konten verbinden.", 403);
    const body = await request.json();
    const r = await fetch(
      (process.env.RUNNER_URL ?? "http://127.0.0.1:3211") + "/auth",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.RUNNER_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: body.action,
          provider: body.provider,
          id: body.id,
          code: body.code,
          owner: user.id,
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = await r.json();
    if (
      r.ok &&
      (body.action === "disconnect" ||
        (["status", "code"].includes(body.action) &&
          result.state === "connected"))
    )
      await query(
        "UPDATE provider_connections SET state='needs_test' WHERE user_id=$1 AND provider=$2 AND state='connected'",
        [user.id, body.provider],
      );
    if (r.ok && ["start", "disconnect"].includes(body.action))
      await audit(user.id, "cli." + body.action, undefined, {
        provider: body.provider,
      });
    return Response.json(result, {
      status: r.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof AppError
            ? e.message
            : "CLI-Anmeldung derzeit nicht erreichbar.",
      },
      { status: e instanceof AppError ? e.status : 503 },
    );
  }
}
