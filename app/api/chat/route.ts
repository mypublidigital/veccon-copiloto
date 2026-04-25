import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { COPILOTO_SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { messages } = await req.json();

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 });
  }

  const validMessages = (messages as { role: string; content: string }[])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  if (validMessages.length === 0) {
    return NextResponse.json({ error: "Nenhuma mensagem válida" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };

      try {
        send({ delta: "[1] iniciando…\n" });

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          send({ delta: "[ERRO] ANTHROPIC_API_KEY ausente no Vercel\n" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        send({
          delta: `[2] API key OK (length=${apiKey.length}, prefix=${apiKey.slice(0, 8)}…)\n`,
        });

        const anthropic = new Anthropic({ apiKey });
        send({ delta: "[3] client criado\n" });

        send({ delta: "[4] chamando messages.create stream=true…\n" });
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 1024,
          system: COPILOTO_SYSTEM_PROMPT,
          messages: validMessages,
          stream: true,
        });
        send({ delta: "[5] stream iniciado, lendo eventos…\n\n---\n\n" });

        let textEvents = 0;
        let totalEvents = 0;
        for await (const event of response) {
          totalEvents++;
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            textEvents++;
            send({ delta: event.delta.text });
          }
        }
        send({
          delta: `\n\n---\n[6] concluído: ${totalEvents} eventos totais, ${textEvents} de texto\n`,
        });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const e = err as { name?: string; message?: string; status?: number; error?: unknown };
        const detail = JSON.stringify(
          {
            name: e.name,
            status: e.status,
            message: e.message,
            error: e.error,
          },
          null,
          2
        );
        console.error("[CHAT] Anthropic error:", err);
        send({ delta: `\n\n[ERRO]\n${detail}\n` });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
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
