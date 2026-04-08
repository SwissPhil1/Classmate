"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (!error) setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
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
              Vérifiez votre boîte mail et cliquez sur le lien pour vous connecter.
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
    </div>
  );
}
