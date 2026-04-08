"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError && callbackError !== "null") {
      setError(`Erreur d'authentification: ${decodeURIComponent(callbackError)}`);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url || url === "" || url.includes("placeholder")) {
        setError(
          "Variables d'environnement manquantes. Redéployez après avoir ajouté NEXT_PUBLIC_SUPABASE_URL dans Vercel."
        );
        setLoading(false);
        return;
      }

      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
      } else {
        setSent(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Erreur de connexion: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-foreground">RadLoop</h1>
        <p className="text-muted-foreground text-sm">
          Système de révision active — FMH2 Radiologie
        </p>
      </div>

      {sent ? (
        <div className="bg-card border border-border rounded-lg p-6 text-center space-y-2">
          <p className="text-foreground font-medium">Lien envoyé !</p>
          <p className="text-muted-foreground text-sm">
            Vérifiez votre boîte mail pour <strong>{email}</strong> et
            cliquez sur le lien pour vous connecter.
          </p>
        </div>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            type="email"
            placeholder="votre@email.ch"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 bg-card border-border"
          />

          {error && (
            <div className="bg-wrong/10 border border-wrong/20 rounded-lg px-4 py-3">
              <p className="text-sm text-wrong">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-teal hover:bg-teal-light text-white font-medium"
          >
            {loading ? "Envoi..." : "Se connecter par magic link"}
          </Button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Suspense fallback={<div className="animate-pulse text-muted-foreground">Chargement...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
