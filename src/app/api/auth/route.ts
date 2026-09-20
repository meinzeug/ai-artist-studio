import { NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { one, query, transaction } from "@/server/db";
import {
  AppError,
  hash,
  passwordHash,
  verifyPassword,
  verifyOrigin,
  currentUser,
  audit,
} from "@/server/security";
export async function GET(request: Request) {
  return NextResponse.json({
    user: (await currentUser(request)) ?? null,
    setupTokenRequired: !!process.env.SETUP_TOKEN,
    needsSetup: !(await one("SELECT id FROM users LIMIT 1")),
  });
}
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const input = z
      .object({
        action: z.enum(["setup", "login", "logout"]),
        email: z.email().optional(),
        password: z.string().max(200).optional(),
        setup_token: z.string().max(200).optional(),
      })
      .parse(await request.json());
    if (input.action === "logout") {
      const token = request.headers
        .get("cookie")
        ?.match(/studio_session=([^;]+)/)?.[1];
      if (token) await query("DELETE FROM sessions WHERE id=$1", [hash(token)]);
      const r = NextResponse.json({ ok: true });
      r.cookies.set("studio_session", "", { maxAge: 0, path: "/" });
      return r;
    }
    const email = input.email?.toLowerCase();
    if (!email || !input.password)
      throw new AppError("E-Mail und Passwort sind erforderlich.");
    const attemptKey = hash(email);
    const attempt = await one("SELECT * FROM login_attempts WHERE key=$1", [
      attemptKey,
    ]);
    if (attempt?.blocked_until && new Date(attempt.blocked_until) > new Date())
      throw new AppError(
        "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.",
        429,
      );
    let user;
    if (input.action === "setup") {
      const setupToken = process.env.SETUP_TOKEN;
      if (
        (process.env.APP_ORIGIN?.startsWith("https:") && !setupToken) ||
        (setupToken && hash(input.setup_token ?? "") !== hash(setupToken))
      )
        throw new AppError(
          "Gültiger Einrichtungscode erforderlich. Den Code erhältst du vom Serverbetreiber.",
          403,
        );
      if (input.password.length < 12)
        throw new AppError(
          "Bitte mindestens 12 Zeichen für das Passwort verwenden.",
        );
      const pw = passwordHash(input.password);
      user = await transaction(async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(7711)");
        if (await one("SELECT id FROM users LIMIT 1", [], c))
          throw new AppError("Einrichtung bereits abgeschlossen.", 409);
        const id = randomUUID();
        await c.query(
          "INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)",
          [id, email, pw],
        );
        await c.query("INSERT INTO settings(user_id) VALUES($1)", [id]);
        return { id, email };
      });
    } else {
      user = await one("SELECT * FROM users WHERE email=$1", [email]);
      if (
        !verifyPassword(
          input.password,
          user?.password_hash ?? passwordHash(randomBytes(16).toString("hex")),
        )
      ) {
        await query(
          "INSERT INTO login_attempts(key,attempts,blocked_until) VALUES($1,1,NULL) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.blocked_until<now() THEN 1 ELSE login_attempts.attempts+1 END,blocked_until=CASE WHEN login_attempts.attempts>=7 THEN now()+interval '15 minutes' ELSE NULL END",
          [attemptKey],
        );
        throw new AppError("E-Mail oder Passwort ist nicht korrekt.", 401);
      }
    }
    await query("DELETE FROM login_attempts WHERE key=$1", [attemptKey]);
    const token = randomBytes(32).toString("hex");
    await query(
      "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [hash(token), user!.id],
    );
    await audit(user!.id, input.action);
    const response = NextResponse.json({ ok: true });
    response.cookies.set("studio_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_ORIGIN?.startsWith("https:"),
      path: "/",
      maxAge: 604800,
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Bitte Eingaben prüfen."
            : (e as Error).message,
      },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
