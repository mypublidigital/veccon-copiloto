"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  user: { id: string; email: string; name: string };
  isAdmin: boolean;
  initialConversations: Conversation[];
}

export default function ChatInterface({ user, isAdmin, initialConversations }: Props) {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const supabase = createClient();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversation = useCallback(
    async (convId: string) => {
      setActiveConvId(convId);
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      setMessages(
        (data ?? []).map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
    },
    [supabase]
  );

  async function newConversation() {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function deleteConversation(convId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("conversations").delete().eq("id", convId);
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
    }
  }

  function startRename(conv: Conversation, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  }

  async function submitRename(convId: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    await supabase
      .from("conversations")
      .update({ title: trimmed })
      .eq("id", convId);
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, title: trimmed } : c))
    );
    setRenamingId(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);

    // Optimistic user message
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: text },
      { id: assistantMsgId, role: "assistant", content: "" },
    ]);

    try {
      // Create or reuse conversation
      let convId = activeConvId;
      if (!convId) {
        const { data: newConv } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            title: text.slice(0, 60) || "Nova conversa",
          })
          .select()
          .single();
        convId = newConv!.id;
        setActiveConvId(convId);
        setConversations((prev) => [newConv!, ...prev]);
      }

      // Save user message
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "user",
        content: text,
      });

      // Log access
      await supabase.from("access_logs").insert({
        user_id: user.id,
        action: "chat_message",
        metadata: { conversation_id: convId },
      });

      // Build history for API (excluding the empty assistant placeholder)
      const history = messages
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: "user", content: text });

      // Streaming call
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, conversationId: convId }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Erro na resposta da API");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // SSE format: lines starting with "data: "
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta) {
                assistantText += parsed.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: assistantText }
                      : m
                  )
                );
              }
            } catch {
              // Skip malformed chunks
            }
          }
        }
      }

      // Save assistant message
      await supabase.from("messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: assistantText,
      });

      // Update conversation updated_at
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", convId);

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId ? { ...c, updated_at: new Date().toISOString() } : c
        )
      );
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    "Desculpe, ocorreu um erro. Por favor, tente novamente.",
                }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }

  return (
    <div className="h-screen flex bg-[#1c1c1c] overflow-hidden">
      {/* LEFT: Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-[#2a2a2a] shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#d32f2f]">
              <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
                <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2.5" fill="none" />
                <circle cx="16" cy="16" r="4" fill="white" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-white">Copiloto IA Veccon</span>
              {activeConvId && (
                <span className="text-xs text-[#6b7280] ml-2">
                  {conversations.find((c) => c.id === activeConvId)?.title}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={newConversation}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white hover:bg-[#333333] rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nova conversa
            </button>

            {isAdmin && (
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#d32f2f] hover:text-white hover:bg-[#d32f2f] border border-[#d32f2f]/40 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Admin
              </button>
            )}

            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-1.5 text-[#6b7280] hover:text-white hover:bg-[#333333] rounded-lg transition-colors"
              title="Alternar histórico"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
          {messages.length === 0 ? (
            <WelcomeScreen userName={user.name || user.email} />
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-[#d32f2f] flex items-center justify-center mt-0.5">
                    <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
                      <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2.5" fill="none" />
                      <circle cx="16" cy="16" r="4" fill="white" />
                    </svg>
                  </div>
                )}
                <div
                  className={`max-w-2xl rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-[#d32f2f] text-white rounded-tr-sm"
                      : "bg-[#252525] text-[#e5e7eb] rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    msg.content ? (
                      <div className="prose-dark">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <TypingIndicator />
                    )
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-[#333333] flex items-center justify-center mt-0.5 text-xs font-semibold text-white">
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-[#2a2a2a]">
          <div className="relative flex items-end gap-2 bg-[#252525] border border-[#333333] rounded-xl p-3 focus-within:border-[#d32f2f]/60 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte ao Copiloto IA Veccon…"
              rows={1}
              disabled={streaming}
              className="flex-1 bg-transparent text-sm text-white placeholder-[#4b5563] resize-none outline-none min-h-[24px] max-h-[160px] scrollbar-thin"
            />
            <button
              onClick={streaming ? () => abortRef.current?.abort() : sendMessage}
              disabled={!streaming && !input.trim()}
              className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                streaming
                  ? "bg-[#333333] hover:bg-[#444444] text-white"
                  : input.trim()
                  ? "bg-[#d32f2f] hover:bg-[#b71c1c] text-white"
                  : "bg-[#333333] text-[#4b5563] cursor-not-allowed"
              }`}
            >
              {streaming ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-center text-[10px] text-[#374151] mt-2">
            Enter para enviar · Shift+Enter para nova linha · IA pode cometer erros — sempre revise.
          </p>
        </div>
      </div>

      {/* RIGHT: Conversation sidebar */}
      {sidebarOpen && (
        <aside className="w-72 border-l border-[#2a2a2a] bg-[#161616] flex flex-col shrink-0">
          {/* Sidebar header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-[#2a2a2a]">
            <span className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
              Conversas
            </span>
            <button
              onClick={newConversation}
              className="w-7 h-7 flex items-center justify-center text-[#6b7280] hover:text-white hover:bg-[#252525] rounded-lg transition-colors"
              title="Nova conversa"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-2 scrollbar-thin">
            {conversations.length === 0 ? (
              <p className="text-xs text-[#4b5563] text-center mt-8 px-4">
                Nenhuma conversa ainda.
                <br />
                Inicie uma nova!
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={`group flex items-start gap-2 px-3 py-2.5 mx-2 rounded-lg cursor-pointer transition-colors ${
                    activeConvId === conv.id
                      ? "bg-[#252525] border border-[#333333]"
                      : "hover:bg-[#1e1e1e]"
                  }`}
                >
                  <svg
                    className="w-3.5 h-3.5 text-[#4b5563] shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>

                  <div className="flex-1 min-w-0">
                    {renamingId === conv.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => submitRename(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(conv.id);
                          if (e.key === "Escape") setRenamingId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full bg-[#1c1c1c] border border-[#d32f2f]/50 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                      />
                    ) : (
                      <>
                        <p className="text-xs text-[#d1d5db] truncate font-medium">
                          {conv.title}
                        </p>
                        <p className="text-[10px] text-[#4b5563] mt-0.5">
                          {formatDate(conv.updated_at)}
                        </p>
                      </>
                    )}
                  </div>

                  {renamingId !== conv.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => startRename(conv, e)}
                        className="p-1 text-[#6b7280] hover:text-white rounded transition-colors"
                        title="Renomear"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="p-1 text-[#6b7280] hover:text-red-400 rounded transition-colors"
                        title="Excluir"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* User footer */}
          <div className="border-t border-[#2a2a2a] p-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#d32f2f]/20 border border-[#d32f2f]/30 flex items-center justify-center text-xs font-semibold text-[#d32f2f]">
                {(user.name || user.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#d1d5db] truncate">
                  {user.name || user.email}
                </p>
                {user.name && (
                  <p className="text-[10px] text-[#4b5563] truncate">{user.email}</p>
                )}
              </div>
              <button
                onClick={handleSignOut}
                className="p-1.5 text-[#4b5563] hover:text-red-400 transition-colors rounded"
                title="Sair"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function WelcomeScreen({ userName }: { userName: string }) {
  const firstName = userName.split(" ")[0].split("@")[0];
  const suggestions = [
    { icon: "💡", text: "Como usar o Claude para criar um script de vendas?" },
    { icon: "📊", text: "Como analisar uma planilha de leads com o Gemini?" },
    { icon: "🔍", text: "Como pesquisar concorrentes com o Perplexity?" },
    { icon: "📚", text: "Como criar um oráculo de documentos com NotebookLM?" },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#d32f2f] flex items-center justify-center mb-6 shadow-lg">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2" fill="none" />
          <circle cx="16" cy="16" r="4" fill="white" />
          <path d="M16 12V8M16 24V20M8 16H4M28 16H24" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white mb-2">
        Olá, {firstName}! 👋
      </h2>
      <p className="text-sm text-[#6b7280] max-w-sm mb-8">
        Sou o <strong className="text-[#d32f2f]">Copiloto IA Veccon</strong>. Estou aqui para te ensinar a usar Claude, Gemini, Perplexity e NotebookLM nas suas tarefas do dia a dia.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
        {suggestions.map((s) => (
          <button
            key={s.text}
            className="flex items-start gap-3 text-left px-4 py-3 bg-[#252525] hover:bg-[#2d2d2d] border border-[#333333] hover:border-[#d32f2f]/40 rounded-xl transition-colors text-sm text-[#9ca3af] hover:text-[#d1d5db]"
            onClick={() => {
              const textarea = document.querySelector("textarea");
              if (textarea) {
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value"
                )?.set;
                nativeInputValueSetter?.call(textarea, s.text);
                textarea.dispatchEvent(new Event("input", { bubbles: true }));
                textarea.focus();
              }
            }}
          >
            <span className="text-lg leading-none">{s.icon}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 h-5">
      <span className="typing-dot w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
      <span className="typing-dot w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
      <span className="typing-dot w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
    </div>
  );
}
