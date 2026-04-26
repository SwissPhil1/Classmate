import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CANONICAL_MNEMONIC_ENTRIES } from '@/lib/mnemonic-whitelist'

/**
 * Seed the `mnemonics` table from the in-code whitelist. Idempotent — re-running
 * after enriching the whitelist updates `theme` and `variants` while preserving
 * `content_md` and `content_status` of existing rows.
 *
 * Auth: any authenticated user can trigger (the catalogue is shared).
 * Writes are gated by RLS and the table only allows authenticated users to
 * write, which is acceptable for personal-use deployments.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const rows = CANONICAL_MNEMONIC_ENTRIES.map((e) => ({
      canonical_name: e.canonical,
      theme: e.theme,
      variants: e.variants,
    }))

    // UPSERT preserves content_md / content_status on existing rows because
    // those columns aren't in the payload.
    const { data, error } = await supabase
      .from('mnemonics')
      .upsert(rows, { onConflict: 'canonical_name' })
      .select('id')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      total: rows.length,
      affected: data?.length ?? 0,
    })
  } catch (err) {
    console.error('seed-mnemonics error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
