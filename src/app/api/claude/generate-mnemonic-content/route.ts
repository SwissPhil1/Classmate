import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

/**
 * Generate Claude pedagogical content for mnemonics whose `content_status` is
 * 'pending'. Idempotent — only touches rows that haven't been generated yet,
 * leaves 'reviewed' rows alone.
 *
 * Body (optional): { batch_size?: number, force?: boolean }.
 *   - batch_size defaults to 10 (≈ 30s per call).
 *   - force regenerates rows already 'generated' (does NOT touch 'reviewed').
 */
export const maxDuration = 60

interface BatchBody {
  batch_size?: number
  force?: boolean
}

interface MnemonicRow {
  id: string
  canonical_name: string
  theme: string
  variants: string[]
}

const SYSTEM_PROMPT = `Tu es radiologue FMH suisse expert et coach pour l'examen oral FMH2. Tu rédiges des mémos courts en français pour des mnémoniques de radiologie validées (extraites de Crack the Core, Core Radiology, Radiology Vibes, ESR EPOS).

Pour chaque mnémonique, produis un markdown propre avec EXACTEMENT cette structure :

## Déploiement
Liste à puces : chaque lettre/élément du sigle → ce qu'il représente. Si le sigle est un nom complet (ex : "Oreo Cookie"), explique le concept en 1-2 lignes.

## Contexte clinique
1-3 phrases : à quoi sert cette mnémonique (DDx d'une masse, classification d'une fracture, signes d'imagerie d'une pathologie, etc.) et la modalité d'imagerie principale concernée.

## Diagnostics différentiels / Cadre d'usage
Liste à puces des entités/conditions principales auxquelles cette mnémonique s'applique. Si c'est une mnémonique de classification (Salter, CHARGE, etc.), explicite chaque grade/critère.

## Piège classique
1 phrase : l'erreur typique qu'un junior fait avec cette mnémonique (oubli d'une entité, confusion avec une autre mnémo, sur/sous-utilisation).

CONTRAINTES STRICTES :
- Tout en français, niveau FMH2 suisse.
- Markdown brut uniquement, pas de méta-commentaires ni "voici le mémo".
- 200-400 mots maximum.
- Si tu ne reconnais pas la mnémonique avec certitude (ambigüité possible avec une variante d'un autre nom), produis quand même un mémo basé sur l'usage le plus probable en radiologie diagnostique. Ne refuse pas.`

function buildUserMessage(m: MnemonicRow): string {
  const aliases = m.variants.filter((v) => v !== m.canonical_name)
  const aliasLine = aliases.length > 0 ? ` (variantes : ${aliases.join(', ')})` : ''
  return `Mnémonique : "${m.canonical_name}"${aliasLine}
Thème : ${m.theme}

Génère le mémo selon la structure imposée.`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as BatchBody
    const batchSize = Math.max(1, Math.min(20, body.batch_size ?? 10))
    const force = body.force === true

    const statusFilter = force ? ['pending', 'generated'] : ['pending']
    const { data: rows, error: fetchErr } = await supabase
      .from('mnemonics')
      .select('id, canonical_name, theme, variants')
      .in('content_status', statusFilter)
      .limit(batchSize)
    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }
    if (!rows || rows.length === 0) {
      return NextResponse.json({ generated: 0, remaining_pending: 0, done: true })
    }

    let generated = 0
    const errors: { canonical_name: string; error: string }[] = []

    for (const m of rows as MnemonicRow[]) {
      try {
        const content = await callClaude(SYSTEM_PROMPT, buildUserMessage(m), 1200)
        const trimmed = content.trim()
        if (trimmed.length < 80) {
          errors.push({ canonical_name: m.canonical_name, error: 'Output too short' })
          continue
        }
        const { error: updErr } = await supabase
          .from('mnemonics')
          .update({
            content_md: trimmed,
            content_status: 'generated',
            updated_at: new Date().toISOString(),
          })
          .eq('id', m.id)
        if (updErr) {
          errors.push({ canonical_name: m.canonical_name, error: updErr.message })
          continue
        }
        generated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        errors.push({ canonical_name: m.canonical_name, error: msg })
      }
    }

    // Count what's still pending so the client can decide whether to call again.
    const { count: remainingPending } = await supabase
      .from('mnemonics')
      .select('id', { count: 'exact', head: true })
      .eq('content_status', 'pending')

    return NextResponse.json({
      generated,
      remaining_pending: remainingPending ?? 0,
      done: (remainingPending ?? 0) === 0,
      errors,
    })
  } catch (err) {
    console.error('generate-mnemonic-content error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
