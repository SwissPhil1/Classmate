import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

/**
 * Non-destructive merge of new reference material into an existing brief.
 * Differs from /api/claude/brief which reconstructs the brief from scratch
 * — this endpoint asks Claude to PATCH only the sections impacted by the
 * new material and preserve everything else textually, including manual
 * edits the user may have made.
 *
 * Response returns the proposed merged content WITHOUT committing it to
 * the database. The caller is expected to show a diff-preview and only
 * persist on explicit user approval.
 */
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { existing_content, new_material, entity_name, source_label } = await request.json()
    if (!existing_content || typeof existing_content !== 'string') {
      return NextResponse.json({ error: 'existing_content required' }, { status: 400 })
    }
    if (!new_material || typeof new_material !== 'string') {
      return NextResponse.json({ error: 'new_material required' }, { status: 400 })
    }

    const systemPrompt = `Tu intègres de la nouvelle matière dans un brief de radiologie FMH2 existant.

RÈGLE ABSOLUE — PRÉSERVATION :
- Tu NE DOIS PAS réécrire le brief depuis zéro.
- Tu DOIS préserver TEXTUELLEMENT les sections non impactées par la nouvelle matière, y compris les éditions manuelles de l'utilisateur.
- Tu ne modifies QUE les sections où la nouvelle matière apporte une information pertinente.

RÈGLES D'INTÉGRATION :
1. Identifie précisément quelles sections du brief existant sont impactées par la nouvelle matière${source_label ? ` (${source_label})` : ''}.
2. Dans ces sections, intègre les ajouts de manière concise — pas de bloat, pas de duplication avec l'existant.
3. Si la nouvelle matière contredit l'existant, PRÉFÉRER la nouvelle (sauf si l'ancienne semble être une édition manuelle explicite).
4. Ne supprime jamais une perle ou un point que l'utilisateur a probablement ajouté.
5. Garde la structure ## Sections du brief intacte.
6. N'ajoute PAS de bannière "Source : X" dans le brief — la traçabilité reste dans la reference_text originale.

FORMAT DE SORTIE :
Renvoie UNIQUEMENT le brief markdown mis à jour, commençant par le même titre/section que l'original. Pas de préambule, pas de commentaire, pas de fence \`\`\`. Si un bloc QA ---QA_JSON--- existe dans l'original, conserve-le à l'identique à la fin.`

    const userMessage = `BRIEF EXISTANT (à patcher):

${existing_content}

---

NOUVELLE MATIÈRE À INTÉGRER${source_label ? ` (source : ${source_label})` : ''}:

${new_material}

${entity_name ? `\n(Entité concernée : ${entity_name})` : ''}

Retourne le brief patché.`

    const response = await callClaude(systemPrompt, userMessage, 16384)

    // Rough change-ratio estimate — if Claude rewrote too much, we warn the
    // caller so they can surface a "gros changement" warning in the diff.
    const changedRatio = estimateChangeRatio(existing_content, response)

    return NextResponse.json({
      merged_content: response.trim(),
      changed_ratio: changedRatio,
    })
  } catch (err) {
    console.error('merge-brief error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function estimateChangeRatio(a: string, b: string): number {
  const lenA = a.length
  const lenB = b.length
  if (lenA === 0) return 1
  // Cheap heuristic: fraction of lines in b that are not also in a.
  const aLines = new Set(a.split('\n').map((l) => l.trim()).filter(Boolean))
  const bLines = b.split('\n').map((l) => l.trim()).filter(Boolean)
  if (bLines.length === 0) return 1
  const shared = bLines.filter((l) => aLines.has(l)).length
  const lineChange = 1 - shared / bLines.length
  // Blend line change + size ratio delta so an append-heavy merge is marked
  // as large even if no existing line was modified.
  const sizeDelta = Math.abs(lenB - lenA) / Math.max(lenA, lenB)
  return Math.min(1, 0.6 * lineChange + 0.4 * sizeDelta)
}
