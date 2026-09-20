// SunoAPI.org documents no verifiable webhook signature. This endpoint only
// acknowledges delivery; authoritative state and media always come from authenticated polling.
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  let size = 0;
  if (reader)
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
      }
    } finally {
      reader.releaseLock();
    }
  return Response.json({ received: true });
}
