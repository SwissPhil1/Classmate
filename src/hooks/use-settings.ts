"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserSettings, upsertUserSettings } from "@/lib/supabase/queries";
import type { UserSettings } from "@/lib/types";
import { useUser } from "./use-user";

export function useSettings() {
  const { user } = useUser();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    getUserSettings(supabase, user.id)
      .then(setSettings)
      .finally(() => setLoading(false));
  }, [user]);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    if (!user) return;
    const updated = await upsertUserSettings(supabase, { user_id: user.id, ...updates });
    setSettings(updated);
  };

  return { settings, loading, updateSettings };
}
