import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";
import { ADMIN_ANALYST_SYSTEM_PROMPT } from "@/lib/system-prompt";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin")
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { messages } = await req.json();

  // Busca contexto do banco para injetar no system prompt
  const [
    { count: totalUsers },
    { count: totalConversations },
    { count: totalMessages },
    { data: recentConvs },
  ] = await Promise.all([
    adminClient.from("profiles").select("*", { count: "exact", head: true }),
    adminClient.from("conversations").select("*", { count: "exact", head: true }),
    adminClient.from("messages").select("*", { count: "exact", head: true }),
    adminClient
      .from("conversations")
      .select("title, profiles(name, email, department), created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const contextData = `
## DADOS ATUAIS DO BANCO DE DADOS

**Resumo geral:**
- Total de usuários: ${totalUsers ?? 0}
- Total de conversas: ${totalConversations ?? 0}
- Total de mensagens: ${totalMessages ?? 0}

**Últimas 30 conversas:**
${
  recentConvs
    ?.map((c: Record<string, unknown>) => {
      const p = c.profiles as Record<string, string> | null;
      return `- "${c.title}" | Usuário: ${p?.name ?? p?.email ?? "desconhecido"} | Depto: ${p?.department ?? "N/D"} | Data: ${new Date(c.created_at as string).toLocaleDateString("pt-BR")}`;
    })
    .join("\n") ?? "Nenhuma conversa"
}`;

  const systemPrompt = ADMIN_ANALYST_SYSTEM_PROMPT + "\n\n" + contextData;

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada" },
      { status: 500 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5",
          max_tokens: 2048,
          system: systemPrompt,
          messages: validMessages,
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const data = JSON.stringify({ delta: event.delta.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("Admin stream error:", err);
        const message = err instanceof Error ? err.message : "Erro interno";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
