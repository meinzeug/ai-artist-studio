import { requireUser, verifyOrigin, own, AppError } from "@/server/security";
import { enqueue } from "@/server/jobs";
import { z } from "zod";
import { randomUUID } from "node:crypto";
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    const user = await requireUser(request);
    const input = z
      .object({ account_id: z.string().uuid() })
      .parse(await request.json());
    const account = await own(user.id, "social_accounts", input.account_id);
    return Response.json(
      await enqueue(
        user.id,
        account.artist_id,
        "sync_metrics",
        input,
        randomUUID(),
      ),
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
