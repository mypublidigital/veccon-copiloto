"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ReactMarkdown from "react-markdown";

type Tab = "dashboard" | "users" | "conversations" | "chat";

interface Profile {
  id: string;
  email: string;
  name: string | null;
  role: string;
  department: string | null;
  created_at: string;
}

interface ConvRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_name: string | null;
  message_count: number;
}

interface DashboardData {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  activeToday: number;
  byDepartment: { department: string; count: number }[];
  recentActivity: { date: string; count: number }[];
}

interface AdminMessage {
  role: "user" | "assistant";
  content: string;
}

export default function AdminPanel({ adminId }: { adminId: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dashboard");
  const supabase = createClient();

  return (
    <div className="h-screen flex flex-col bg-[#1c1c1c]">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-[#2a2a2a] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#d32f2f] flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
              <path d="M16 4L28 10V22L16 28L4 22V10L16 4Z" stroke="white" strokeWidth="2.5" fill="none" />
              <circle cx="16" cy="16" r="4" fill="white" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold text-white">Painel Admin</span>
            <span className="text-xs text-[#6b7280] ml-2">Copiloto IA Veccon</span>
          </div>
        </div>
        <button
          onClick={() => router.push("/chat")}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#9ca3af] hover:text-white hover:bg-[#333333] rounded-lg transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Voltar ao chat
        </button>
      </header>

      {/* Tabs */}
      <nav className="flex items-center gap-1 px-6 py-2 border-b border-[#2a2a2a] shrink-0">
        {(
          [
            { key: "dashboard", label: "Dashboard", icon: "📊" },
            { key: "users", label: "Usuários", icon: "👥" },
            { key: "conversations", label: "Conversas", icon: "💬" },
            { key: "chat", label: "Agente Analítico", icon: "🤖" },
          ] as { key: Tab; label: string; icon: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-[#d32f2f] text-white"
                : "text-[#6b7280] hover:text-white hover:bg-[#2a2a2a]"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "users" && <UsersTab />}
        {tab === "conversations" && <ConversationsTab />}
        {tab === "chat" && <AdminChatTab adminId={adminId} />}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   DASHBOARD TAB
────────────────────────────────────────────── */
function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/dashboard");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-[#d32f2f] border-t-transparent rounded-full" />
      </div>
    );

  if (!data) return <p className="text-center text-[#6b7280] mt-12">Erro ao carregar dados.</p>;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6 scrollbar-thin">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Usuários", value: data.totalUsers, icon: "👥", color: "#3b82f6" },
          { label: "Conversas", value: data.totalConversations, icon: "💬", color: "#10b981" },
          { label: "Mensagens", value: data.totalMessages, icon: "📨", color: "#8b5cf6" },
          { label: "Ativos hoje", value: data.activeToday, icon: "⚡", color: "#d32f2f" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[#252525] border border-[#333333] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{kpi.icon}</span>
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: kpi.color }}
              />
            </div>
            <p className="text-2xl font-bold text-white">{kpi.value}</p>
            <p className="text-xs text-[#6b7280] mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Department */}
        <div className="bg-[#252525] border border-[#333333] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Uso por departamento</h3>
          {data.byDepartment.length === 0 ? (
            <p className="text-xs text-[#6b7280]">Nenhum dado disponível.</p>
          ) : (
            <div className="space-y-3">
              {data.byDepartment.map((d) => {
                const max = Math.max(...data.byDepartment.map((x) => x.count));
                const pct = max > 0 ? (d.count / max) * 100 : 0;
                return (
                  <div key={d.department}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[#d1d5db]">{d.department || "Não definido"}</span>
                      <span className="text-[#6b7280]">{d.count} conv.</span>
                    </div>
                    <div className="h-1.5 bg-[#333333] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#d32f2f] rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-[#252525] border border-[#333333] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Atividade recente (7 dias)</h3>
          {data.recentActivity.length === 0 ? (
            <p className="text-xs text-[#6b7280]">Nenhuma atividade recente.</p>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {data.recentActivity.map((a) => {
                const max = Math.max(...data.recentActivity.map((x) => x.count));
                const pct = max > 0 ? (a.count / max) * 100 : 0;
                return (
                  <div key={a.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex items-end justify-center" style={{ height: "72px" }}>
                      <div
                        className="w-full bg-[#d32f2f]/60 hover:bg-[#d32f2f] rounded-sm transition-colors"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                        title={`${a.count} conversas`}
                      />
                    </div>
                    <span className="text-[9px] text-[#4b5563]">
                      {new Date(a.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   USERS TAB
────────────────────────────────────────────── */
function UsersTab() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    password: "",
    role: "user",
    department: "",
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const DEPARTMENTS = [
    "Vendas",
    "Marketing",
    "Jurídico",
    "RH",
    "Admin/Financeiro",
    "SAC",
    "Liberação de Obras",
    "Diretoria",
    "Outro",
  ];

  async function loadUsers() {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) {
      const json = await res.json();
      setUsers(json.users ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser() {
    setFormError("");
    if (!newUser.email || !newUser.password) {
      setFormError("E-mail e senha são obrigatórios.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    const json = await res.json();
    if (!res.ok) {
      setFormError(json.error ?? "Erro ao criar usuário.");
    } else {
      setShowForm(false);
      setNewUser({ name: "", email: "", password: "", role: "user", department: "" });
      loadUsers();
    }
    setCreating(false);
  }

  async function deleteUser(userId: string) {
    if (!confirm("Tem certeza que deseja excluir este usuário?")) return;
    await fetch(`/api/admin/users?id=${userId}`, { method: "DELETE" });
    loadUsers();
  }

  async function resetPassword(userId: string, email: string) {
    const newPassword = prompt(`Nova senha para ${email}:`);
    if (!newPassword || newPassword.length < 6) {
      alert("Senha deve ter no mínimo 6 caracteres.");
      return;
    }
    const res = await fetch("/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, password: newPassword }),
    });
    if (res.ok) {
      alert("Senha redefinida com sucesso!");
    } else {
      alert("Erro ao redefinir senha.");
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-thin">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-white">
          Usuários ({users.length})
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#d32f2f] hover:bg-[#b71c1c] text-white text-sm rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo usuário
        </button>
      </div>

      {/* New user form */}
      {showForm && (
        <div className="bg-[#252525] border border-[#333333] rounded-xl p-5 mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-white">Cadastrar novo usuário</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1">Nome</label>
              <input
                value={newUser.name}
                onChange={(e) => setNewUser((v) => ({ ...v, name: e.target.value }))}
                placeholder="João Silva"
                className="w-full px-3 py-2 bg-[#1c1c1c] border border-[#333333] rounded-lg text-sm text-white placeholder-[#4b5563] outline-none focus:border-[#d32f2f] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1">E-mail *</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((v) => ({ ...v, email: e.target.value }))}
                placeholder="joao@veccon.com.br"
                className="w-full px-3 py-2 bg-[#1c1c1c] border border-[#333333] rounded-lg text-sm text-white placeholder-[#4b5563] outline-none focus:border-[#d32f2f] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1">Senha *</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((v) => ({ ...v, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-3 py-2 bg-[#1c1c1c] border border-[#333333] rounded-lg text-sm text-white placeholder-[#4b5563] outline-none focus:border-[#d32f2f] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1">Departamento</label>
              <select
                value={newUser.department}
                onChange={(e) => setNewUser((v) => ({ ...v, department: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1c1c1c] border border-[#333333] rounded-lg text-sm text-white outline-none focus:border-[#d32f2f] transition-colors"
              >
                <option value="">Selecionar...</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#9ca3af] mb-1">Perfil</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((v) => ({ ...v, role: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1c1c1c] border border-[#333333] rounded-lg text-sm text-white outline-none focus:border-[#d32f2f] transition-colors"
              >
                <option value="user">Colaborador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          {formError && (
            <p className="text-xs text-red-400">{formError}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={createUser}
              disabled={creating}
              className="px-4 py-2 bg-[#d32f2f] hover:bg-[#b71c1c] disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {creating ? "Criando..." : "Criar usuário"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-[#333333] hover:bg-[#444444] text-[#9ca3af] text-sm rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Users table */}
      {loading ? (
        <div className="flex justify-center mt-12">
          <div className="animate-spin w-8 h-8 border-2 border-[#d32f2f] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="bg-[#252525] border border-[#333333] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#333333]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">E-mail</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Departamento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Perfil</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Criado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  className={`border-b border-[#2a2a2a] last:border-0 hover:bg-[#2a2a2a] transition-colors ${
                    i % 2 === 0 ? "" : "bg-[#1e1e1e]"
                  }`}
                >
                  <td className="px-4 py-3 text-[#d1d5db] font-medium">
                    {u.name || "—"}
                  </td>
                  <td className="px-4 py-3 text-[#9ca3af]">{u.email}</td>
                  <td className="px-4 py-3 text-[#9ca3af]">{u.department || "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === "admin"
                          ? "bg-[#d32f2f]/20 text-[#d32f2f] border border-[#d32f2f]/30"
                          : "bg-[#333333] text-[#9ca3af]"
                      }`}
                    >
                      {u.role === "admin" ? "Admin" : "Colaborador"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#6b7280] text-xs">
                    {new Date(u.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => resetPassword(u.id, u.email)}
                        className="p-1.5 text-[#6b7280] hover:text-blue-400 transition-colors rounded"
                        title="Redefinir senha"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => deleteUser(u.id)}
                        className="p-1.5 text-[#6b7280] hover:text-red-400 transition-colors rounded"
                        title="Excluir"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <p className="text-center text-[#6b7280] text-sm py-8">Nenhum usuário cadastrado.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   CONVERSATIONS TAB
────────────────────────────────────────────── */
function ConversationsTab() {
  const [convs, setConvs] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/admin/conversations");
      if (res.ok) {
        const json = await res.json();
        setConvs(json.conversations ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  const filtered = convs.filter(
    (c) =>
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.user_email.toLowerCase().includes(search.toLowerCase()) ||
      (c.user_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto p-6 scrollbar-thin">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-base font-semibold text-white">
          Todas as conversas ({convs.length})
        </h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título ou usuário..."
          className="px-3 py-2 bg-[#252525] border border-[#333333] rounded-lg text-sm text-white placeholder-[#4b5563] outline-none focus:border-[#d32f2f] transition-colors w-64"
        />
      </div>

      {loading ? (
        <div className="flex justify-center mt-12">
          <div className="animate-spin w-8 h-8 border-2 border-[#d32f2f] border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="bg-[#252525] border border-[#333333] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#333333]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Conversa</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Msgs</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Criada</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#6b7280] uppercase tracking-wider">Atualizada</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr
                  key={c.id}
                  className={`border-b border-[#2a2a2a] last:border-0 hover:bg-[#2a2a2a] transition-colors ${
                    i % 2 === 0 ? "" : "bg-[#1e1e1e]"
                  }`}
                >
                  <td className="px-4 py-3 text-[#d1d5db] font-medium max-w-xs truncate">
                    {c.title}
                  </td>
                  <td className="px-4 py-3 text-[#9ca3af]">
                    <div>
                      <p>{c.user_name || "—"}</p>
                      <p className="text-xs text-[#6b7280]">{c.user_email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#9ca3af]">{c.message_count}</td>
                  <td className="px-4 py-3 text-[#6b7280] text-xs whitespace-nowrap">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-[#6b7280] text-xs whitespace-nowrap">
                    {new Date(c.updated_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-[#6b7280] text-sm py-8">Nenhuma conversa encontrada.</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   ADMIN CHAT TAB
────────────────────────────────────────────── */
function AdminChatTab({ adminId }: { adminId: string }) {
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setStreaming(true);

    const userMsg: AdminMessage = { role: "user", content: text };
    const assistantMsgId = "__streaming__";
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: "" }]);

    try {
      abortRef.current = new AbortController();
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) throw new Error("Erro");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.delta) {
                assistantText += parsed.delta;
                setMessages((prev) => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: "assistant", content: assistantText };
                  return copy;
                });
              }
            } catch {
              /* skip */
            }
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: "Desculpe, ocorreu um erro. Tente novamente.",
          };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  const suggestions = [
    "Quantas conversas foram criadas esta semana?",
    "Quais usuários mais usam a plataforma?",
    "Quais departamentos são mais ativos?",
    "Resuma os temas mais discutidos nas conversas.",
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-5xl mb-4">🤖</div>
            <h3 className="text-base font-semibold text-white mb-2">Agente Analítico</h3>
            <p className="text-sm text-[#6b7280] max-w-sm mb-6">
              Faça perguntas sobre o uso da plataforma. O agente consulta os dados e responde com insights.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-left px-4 py-3 bg-[#252525] hover:bg-[#2d2d2d] border border-[#333333] hover:border-[#d32f2f]/40 rounded-xl text-sm text-[#9ca3af] hover:text-[#d1d5db] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 w-8 h-8 rounded-lg bg-[#252525] border border-[#333333] flex items-center justify-center text-base mt-0.5">
                  🤖
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
                    <div className="flex items-center gap-1 h-5">
                      <span className="typing-dot w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
                      <span className="typing-dot w-1.5 h-1.5 bg-[#6b7280] rounded-full" />
                    </div>
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <div className="relative flex items-end gap-2 bg-[#252525] border border-[#333333] rounded-xl p-3 focus-within:border-[#d32f2f]/60 transition-colors">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Pergunte sobre os dados da plataforma…"
            rows={1}
            disabled={streaming}
            className="flex-1 bg-transparent text-sm text-white placeholder-[#4b5563] resize-none outline-none min-h-[24px] max-h-[120px] scrollbar-thin"
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
      </div>
    </div>
  );
}
