"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCurriculum, getUserSettings } from "@/lib/supabase/queries";
import type { Curriculum } from "@/lib/types";
import { useUser } from "./use-user";

/**
 * Resolves the active curriculum for the current user (radiology, nuclear
 * medicine, …) by reading `user_settings.curriculum_id` then loading the
 * matching `curricula` row. Components use the returned `id` to scope topic /
 * chapter / mnemonic queries, and `curriculum.display_name` / dates / labels
 * to drive UI strings.
 */
export function useCurriculum() {
  const { user } = useUser();
  const [curriculum, setCurriculum] = useState<Curriculum | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await getUserSettings(supabase, user.id);
        if (!settings?.curriculum_id) {
          if (!cancelled) setCurriculum(null);
          return;
        }
        const cur = await getCurriculum(supabase, settings.curriculum_id);
        if (!cancelled) setCurriculum(cur);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { curriculum, loading };
}
