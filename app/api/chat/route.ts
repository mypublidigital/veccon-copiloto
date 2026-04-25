import { NextRequest } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// VERSÃO DIAGNÓSTICA — não chama Anthropic, só testa streaming SSE no Vercel
export async function POST(_req: NextRequest) {
  console.log("[DIAG] Request received at /api/chat");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        console.log("[DIAG] Stream start callback executing");

        // Evento sentinel imediato
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ delta: "PING " })}\n\n`)
        );
        console.log("[DIAG] Sent PING");

        // 5 chunks com delays para simular streaming real
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 300));
          const text = `chunk-${i} `;
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ delta: text })}\n\n`)
          );
          console.log(`[DIAG] Sent chunk-${i}`);
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        console.log("[DIAG] Sent DONE");
      } catch (err) {
        console.error("[DIAG] Error in stream:", err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: String(err) })}\n\n`
          )
        );
      } finally {
        controller.close();
        console.log("[DIAG] Stream closed");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
