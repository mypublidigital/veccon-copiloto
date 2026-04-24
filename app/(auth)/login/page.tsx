"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("E-mail ou senha incorretos. Tente novamente.");
      setLoading(false);
      return;
    }

    router.push("/chat");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1c1c1c] relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #d32f2f 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #d32f2f 0%, transparent 70%)" }}
        />
      </div>

      <div className="w-full max-w-sm mx-4 relative">
        {/* Card */}
        <div className="bg-[#252525] border border-[#333333] rounded-2xl p-8 shadow-2xl">
          {/* Logo / Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#d32f2f] mb-4 shadow-lg">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 4L28 10V22L16 28L4 22V10L16 4Z"
                  stroke="white"
                  strokeWidth="2"
                  fill="none"
                />
                <circle cx="16" cy="16" r="4" fill="white" />
                <path d="M16 12V8M16 24V20M8 16H4M28 16H24" stroke="white" strokeWidth="1.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Copiloto IA
            </h1>
            <p className="text-sm text-[#6b7280] mt-1">
              Veccon Empreendimentos
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1.5">
                E-mail corporativo
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="seu@veccon.com.br"
                className="w-full px-4 py-2.5 bg-[#1c1c1c] border border-[#333333] rounded-lg text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#d32f2f] focus:ring-1 focus:ring-[#d32f2f] transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#9ca3af] mb-1.5">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-[#1c1c1c] border border-[#333333] rounded-lg text-white placeholder-[#4b5563] text-sm focus:outline-none focus:border-[#d32f2f] focus:ring-1 focus:ring-[#d32f2f] transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-800/40 rounded-lg">
                <svg
                  className="w-4 h-4 text-red-400 mt-0.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#d32f2f] hover:bg-[#b71c1c] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#d32f2f] focus:ring-offset-2 focus:ring-offset-[#252525] mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Entrando...
                </span>
              ) : (
                "Entrar"
              )}
            </button>
          </form>

          <p className="text-center text-xs text-[#4b5563] mt-6">
            Acesso restrito a colaboradores Veccon.
            <br />
            Em caso de problemas, fale com o administrador.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#374151] mt-4">
          © 2026 Veccon Empreendimentos Imobiliários
        </p>
      </div>
    </div>
  );
}
