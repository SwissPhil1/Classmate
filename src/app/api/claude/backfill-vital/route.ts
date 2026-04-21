import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

// Allow longer execution for the batched backfill (up to ~5 min on Vercel Pro).
export const maxDuration = 300

/**
 * One-shot backfill: scan all of the user's briefs and tag the most clinically
 * "vital" entities (asymmetric / can't-miss diagnostics) plus the most useful
 * mnemonics. Claude is asked to be selective — typically 15–25% of entities
 * become vital, not the long tail.
 *
 * Manual priority choices are NEVER overwritten.
 */

const BATCH_SIZE = 25
const MAX_BRIEF_CHARS = 1500

interface CandidateInput {
  idx: number
  id: string
  name: string
  chapter: string
  topic: string
  brief_excerpt: string
}

interface ClaudeEvaluation {
  idx: number
  is_vital: boolean
  has_mnemonic: boolean
  mnemonic_name: string | null
}

interface AppliedRow {
  id: string
  name: string
  chapter: string
  is_vital: boolean
  has_mnemonic: boolean
  mnemonic_name: string | null
  changed: boolean
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = body?.dry_run === true

    // Eligible: has a brief, not manually pinned
    const { data: rawEntities, error } = await supabase
      .from('entities')
      .select('id, name, priority, priority_source, has_mnemonic, mnemonic_name, chapter:chapters(name, topic:topics(name)), brief:briefs(content)')
      .eq('user_id', user.id)
      .or('priority_source.is.null,priority_source.eq.auto')
    if (error) throw error

    type RawEntity = {
      id: string
      name: string
      priority: string
      priority_source: string | null
      has_mnemonic: boolean
      mnemonic_name: string | null
      chapter: { name?: string; topic?: { name?: string } | null } | { name?: string; topic?: { name?: string } | null }[] | null
      brief: { content?: string } | { content?: string }[] | null
    }

    const eligible = (rawEntities as RawEntity[] | null ?? []).filter((e) => {
      const brief = Array.isArray(e.brief) ? e.brief[0] : e.brief
      return brief?.content && brief.content.length > 200
    })

    if (eligible.length === 0) {
      return NextResponse.json({
        evaluated: 0,
        marked_vital: 0,
        marked_mnemonic: 0,
        applied: [],
        message: 'Aucun brief à évaluer.',
      })
    }

    // Build batches
    const allApplied: AppliedRow[] = []
    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      const slice = eligible.slice(i, i + BATCH_SIZE)
      const candidates: CandidateInput[] = slice.map((e, j) => {
        const chapter = Array.isArray(e.chapter) ? e.chapter[0] : e.chapter
        const brief = Array.isArray(e.brief) ? e.brief[0] : e.brief
        const excerpt = (brief?.content ?? '').substring(0, MAX_BRIEF_CHARS)
        return {
          idx: j,
          id: e.id,
          name: e.name,
          chapter: chapter?.name ?? '',
          topic: chapter?.topic?.name ?? '',
          brief_excerpt: excerpt,
        }
      })

      const evaluations = await evaluateBatch(candidates)

      for (const ev of evaluations) {
        const cand = candidates[ev.idx]
        if (!cand) continue
        const entity = slice.find((e) => e.id === cand.id)
        if (!entity) continue

        const wantsVital = ev.is_vital === true
        const newPriority = wantsVital ? 'vital' : 'normal'
        const changed =
          newPriority !== entity.priority ||
          ev.has_mnemonic !== entity.has_mnemonic ||
          (ev.mnemonic_name ?? null) !== (entity.mnemonic_name ?? null)

        allApplied.push({
          id: cand.id,
          name: cand.name,
          chapter: cand.chapter,
          is_vital: wantsVital,
          has_mnemonic: ev.has_mnemonic === true,
          mnemonic_name: ev.mnemonic_name,
          changed,
        })

        if (!dryRun && changed) {
          await supabase
            .from('entities')
            .update({
              priority: newPriority,
              priority_source: 'auto',
              has_mnemonic: ev.has_mnemonic === true,
              mnemonic_name: ev.mnemonic_name ?? null,
            })
            .eq('id', cand.id)
        }
      }
    }

    const markedVital = allApplied.filter((a) => a.is_vital).length
    const markedMnemonic = allApplied.filter((a) => a.has_mnemonic).length

    return NextResponse.json({
      evaluated: eligible.length,
      marked_vital: markedVital,
      marked_mnemonic: markedMnemonic,
      applied: allApplied,
      dry_run: dryRun,
    })
  } catch (err) {
    console.error('Backfill vital error:', err)
    return NextResponse.json({ error: 'Backfill indisponible temporairement' }, { status: 500 })
  }
}

async function evaluateBatch(candidates: CandidateInput[]): Promise<ClaudeEvaluation[]> {
  const list = candidates.map((c) => ({
    idx: c.idx,
    name: c.name,
    chapter: c.chapter,
    topic: c.topic,
    brief: c.brief_excerpt,
  }))

  const systemPrompt = `Tu es un radiologue expert et coach pour l'examen FMH2 suisse. Évalue cette liste d'entités radiologiques (avec leur brief abrégé) et identifie sélectivement :

1) **is_vital = true** uniquement pour les entités à FORTE asymétrie clinique : "can't miss", urgences STAT, diagnostics dont l'omission a des conséquences immédiates pour le patient. Exemples typiques : dissection aortique, embolie pulmonaire, pneumothorax sous tension, AVC hémorragique / ischémique, hémorragie sous-arachnoïdienne, ischémie mésentérique, abcès cérébral, méningite/encéphalite, ostéomyélite aiguë, fracture instable du rachis, urgences pédiatriques (volvulus, intussusception, abus, malformations critiques), syndrome compartimental, dissection de carotide, NSTEMI / STEMI, sepsis sur abcès, PID grave, occlusion intestinale haute, perforation digestive. EXCLURE les diagnostics non-urgents même importants académiquement (variantes anatomiques, tumeurs bénignes, pathologies chroniques stables).

2) **has_mnemonic = true** UNIQUEMENT si une mnémonique RECONNUE et VRAIMENT UTILISÉE en pratique est pertinente pour cette entité. Exemples valides : MEGA (tumeurs fosse postérieure pédiatriques), TORCH (infections congénitales), FEGNOMASHIC (lésions lytiques osseuses), VITAMIN-CD (DDx large), 4T's (masses médiastinales antérieures), MELAS, MS-DUST (sclérose en plaques DDx), CRITOL (ossification coude), CHARGE, VACTERL. NE PAS compter VINDICATE (cadre générique). Sois exigeant : seulement les mnémos qu'un radiologue réutilise effectivement en garde.

3) **mnemonic_name** : nom court en MAJUSCULES si has_mnemonic = true (ex: "MEGA"), sinon null.

CRITÈRE DE SÉLECTIVITÉ : sur ${candidates.length} entités, vise idéalement 20–35% en vital et 10–20% avec mnémo. Si tu hésites, mets false. La qualité prime sur le volume.

Renvoie UNIQUEMENT un JSON array, un objet par entité dans l'ordre fourni (utilise le champ "idx" pour la correspondance) :
[{"idx": 0, "is_vital": true|false, "has_mnemonic": true|false, "mnemonic_name": "NOM"|null}, ...]

Pas de texte avant ou après le JSON. Pas de fence \`\`\`.`

  const userMessage = JSON.stringify(list)

  const response = await callClaude(systemPrompt, userMessage, 4096)
  let parsed: ClaudeEvaluation[] = []
  try {
    parsed = parseClaudeJSON<ClaudeEvaluation[]>(response)
  } catch (err) {
    console.error('Backfill batch parse error:', err, 'response:', response.substring(0, 500))
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed
}
