import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CANONICAL_MNEMONICS } from '@/lib/mnemonic-whitelist'
import { mnemonicIsNegated } from '@/lib/mnemonic-detection'

/**
 * Server-side scan: for every brief belonging to the authenticated user, look
 * for any variant of any whitelisted mnemonic in the brief's content. If a
 * match is found and the entity is not already tagged, set
 * `entities.has_mnemonic = true` and `entities.mnemonic_name = <canonical>`.
 *
 * No Claude calls — pure regex on the user-validated whitelist
 * (`src/lib/mnemonic-whitelist.ts`). Cheap and instant.
 *
 * Negation guard: if the brief explicitly says "pas de mnémonique" in the
 * `## Mnémonique` section, skip the brief (do not tag). This honours the
 * pre-existing convention used by /api/claude/backfill-vital.
 *
 * Idempotent: only writes false → true. Never untags an already-tagged entity.
 */
export const maxDuration = 30

interface BriefRow {
  id: string
  entity_id: string
  content: string
}

interface EntityRow {
  id: string
  has_mnemonic: boolean | null
  mnemonic_name: string | null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a regex that matches `variant` as a whole token, allowing flexible
 * whitespace between words. Used to detect mnemonics like "7 Up Coke Down"
 * or "MAGIC DR" inside free-form markdown without false positives on
 * sub-strings.
 */
function buildVariantPattern(variant: string): RegExp {
  const tokens = variant.trim().split(/\s+/).map(escapeRegex)
  if (tokens.length === 0) return /(?!)/
  // \b before/after for single token; for multi-token the inter-token \s+ is
  // sufficient and \b at the edges keeps the boundary check.
  const body = tokens.join('\\s+')
  return new RegExp(`(?:^|[^A-Za-z0-9])(?:${body})(?:[^A-Za-z0-9]|$)`, 'i')
}

// Pre-compile the patterns once per cold start. Each entry is { canonical,
// patterns } so we can short-circuit on the first matching variant.
const COMPILED = CANONICAL_MNEMONICS.map((variants) => ({
  canonical: variants[0],
  patterns: variants.map(buildVariantPattern),
}))

function detectMnemonic(content: string): string | null {
  for (const { canonical, patterns } of COMPILED) {
    for (const re of patterns) {
      if (re.test(content)) return canonical
    }
  }
  return null
}

export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Pull all briefs for this user (RLS will scope, but we pass user_id
    // explicitly for defense in depth and to avoid any accidental fan-out).
    const { data: briefs, error: brErr } = await supabase
      .from('briefs')
      .select('id, entity_id, content')
      .eq('user_id', user.id)
    if (brErr) {
      return NextResponse.json({ error: brErr.message }, { status: 500 })
    }
    if (!briefs || briefs.length === 0) {
      return NextResponse.json({ scanned: 0, tagged: 0, skipped_negated: 0, already_tagged: 0 })
    }

    // Pull the entities we'll potentially tag.
    const entityIds = Array.from(new Set((briefs as BriefRow[]).map((b) => b.entity_id)))
    const { data: entities, error: enErr } = await supabase
      .from('entities')
      .select('id, has_mnemonic, mnemonic_name')
      .eq('user_id', user.id)
      .in('id', entityIds)
    if (enErr) {
      return NextResponse.json({ error: enErr.message }, { status: 500 })
    }
    const entityById = new Map<string, EntityRow>(
      ((entities ?? []) as EntityRow[]).map((e) => [e.id, e])
    )

    let scanned = 0
    let tagged = 0
    let skippedNegated = 0
    let alreadyTagged = 0

    for (const brief of briefs as BriefRow[]) {
      scanned++
      const ent = entityById.get(brief.entity_id)
      if (!ent) continue
      if (ent.has_mnemonic === true && ent.mnemonic_name) {
        alreadyTagged++
        continue
      }
      if (mnemonicIsNegated(brief.content)) {
        skippedNegated++
        continue
      }
      const canonical = detectMnemonic(brief.content)
      if (!canonical) continue

      const { error: upErr } = await supabase
        .from('entities')
        .update({ has_mnemonic: true, mnemonic_name: canonical })
        .eq('id', brief.entity_id)
        .eq('user_id', user.id)
      if (upErr) {
        console.error('backfill-mnemonic-flags update error:', upErr)
        continue
      }
      tagged++
    }

    return NextResponse.json({ scanned, tagged, skipped_negated: skippedNegated, already_tagged: alreadyTagged })
  } catch (err) {
    console.error('backfill-mnemonic-flags error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
