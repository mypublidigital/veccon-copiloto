import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropic, ADMIN_MODEL } from "@/lib/anthropic";
import { ADMIN_ANALYST_SYSTEM_PROMPT } from "@/lib/system-prompt";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  // Check admin role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin")
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });

  const { messages } = await req.json();

  // Fetch context data to inject into the system prompt
  const adminClient = createAdminClient();

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
      const profile = c.profiles as Record<string, string> | null;
      return `- "${c.title}" | Usuário: ${profile?.name ?? profile?.email ?? "desconhecido"} | Depto: ${profile?.department ?? "N/D"} | Data: ${new Date(c.created_at as string).toLocaleDateString("pt-BR")}`;
    })
    .join("\n") ?? "Nenhuma conversa"
}
`;

  const systemPrompt = ADMIN_ANALYST_SYSTEM_PROMPT + "\n\n" + contextData;

  const validMessages = (messages as { role: string; content: string }[])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content),
    }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: ADMIN_MODEL,
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
      } catch (error) {
        console.error("Admin chat error:", error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: "Erro interno" })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
