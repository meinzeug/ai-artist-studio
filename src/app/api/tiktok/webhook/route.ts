import { AppError } from "@/server/security";
import { receiveWebhook } from "@/providers/tiktok";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 100000) throw new AppError("Webhook zu groß.", 413);
    return Response.json(
      await receiveWebhook(raw, request.headers.get("tiktok-signature") ?? ""),
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: e instanceof AppError ? e.status : 400 },
    );
  }
}
