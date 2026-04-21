import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'
import type { BriefAuditItem, BriefAuditReport } from '@/lib/types'

// Vercel Pro max; audit is batched but can take a few minutes on large libraries.
export const maxDuration = 300

const BATCH_SIZE = 10
const MAX_BRIEF_CHARS = 2500
const MIN_BRIEF_CHARS = 500

interface CandidateInput {
  idx: number
  id: string
  name: string
  chapter: string
  topic: string
  brief_excerpt: string
}

interface ClaudeAuditRow {
  idx: number
  status: 'ok' | 'needs_fix'
  gaps: string[]
  suggested_grouping: string | null
}

/**
 * Phase 1 of the brief audit workflow: scan each brief with Claude and flag
 * gaps (missing DDx entries, missing perles, possible etiological grouping)
 * WITHOUT modifying the brief. The report is persisted on user_settings and
 * rendered by /stats/audit, where the user can apply fixes entity-by-entity
 * via the existing /api/claude/brief endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const offset: number = typeof body?.offset === 'number' ? body.offset : 0
    const chunkSize: number = typeof body?.chunk_size === 'number' ? body.chunk_size : 60
    const reset: boolean = body?.reset === true

    const { data: rawEntities, error } = await supabase
      .from('entities')
      .select('id, name, chapter:chapters(name, topic:topics(name)), brief:briefs(content)')
      .eq('user_id', user.id)
      .order('name')
    if (error) throw error

    type RawEntity = {
      id: string
      name: string
      chapter: { name?: string; topic?: { name?: string } | null } | { name?: string; topic?: { name?: string } | null }[] | null
      brief: { content?: string } | { content?: string }[] | null
    }

    const allEligible = (rawEntities as RawEntity[] | null ?? []).filter((e) => {
      const brief = Array.isArray(e.brief) ? e.brief[0] : e.brief
      return brief?.content && brief.content.length >= MIN_BRIEF_CHARS
    })

    const total = allEligible.length
    const slice = allEligible.slice(offset, offset + chunkSize)

    // Build candidate payloads
    const candidates: CandidateInput[] = slice.map((e, j) => {
      const chapter = Array.isArray(e.chapter) ? e.chapter[0] : e.chapter
      const brief = Array.isArray(e.brief) ? e.brief[0] : e.brief
      return {
        idx: j,
        id: e.id,
        name: e.name,
        chapter: chapter?.name ?? '',
        topic: chapter?.topic?.name ?? '',
        brief_excerpt: (brief?.content ?? '').substring(0, MAX_BRIEF_CHARS),
      }
    })

    const newItems: BriefAuditItem[] = []
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE)
      const rows = await auditBatch(batch)
      for (const row of rows) {
        const cand = batch[row.idx]
        if (!cand) continue
        newItems.push({
          entity_id: cand.id,
          status: row.status === 'needs_fix' ? 'needs_fix' : 'ok',
          gaps: Array.isArray(row.gaps) ? row.gaps.filter((g) => typeof g === 'string') : [],
          suggested_grouping: typeof row.suggested_grouping === 'string' && row.suggested_grouping.trim() ? row.suggested_grouping.trim() : null,
          ignored: false,
        })
      }
    }

    // Merge with prior report unless reset=true or offset=0 with first call
    let existingReport: BriefAuditReport | null = null
    if (!reset && offset > 0) {
      const { data: prior } = await supabase
        .from('user_settings')
        .select('last_audit')
        .eq('user_id', user.id)
        .single()
      if (prior?.last_audit) existingReport = prior.last_audit as BriefAuditReport
    }

    const mergedById = new Map<string, BriefAuditItem>()
    if (existingReport) {
      for (const it of existingReport.items) mergedById.set(it.entity_id, it)
    }
    for (const it of newItems) {
      // Preserve "ignored" state from prior report if present
      const prev = mergedById.get(it.entity_id)
      mergedById.set(it.entity_id, {
        ...it,
        ignored: prev?.ignored === true,
      })
    }

    const report: BriefAuditReport = {
      generated_at: new Date().toISOString(),
      items: Array.from(mergedById.values()),
    }

    // Upsert onto user_settings
    const { error: upsertErr } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: user.id, last_audit: report },
        { onConflict: 'user_id' }
      )
    if (upsertErr) throw upsertErr

    const nextOffset = offset + slice.length
    const done = nextOffset >= total

    return NextResponse.json({
      total,
      processed: slice.length,
      next_offset: done ? null : nextOffset,
      done,
      needs_fix_count: report.items.filter((i) => i.status === 'needs_fix' && !i.ignored).length,
      ok_count: report.items.filter((i) => i.status === 'ok').length,
    })
  } catch (err) {
    console.error('Audit briefs error:', err)
    return NextResponse.json({ error: 'Audit indisponible temporairement' }, { status: 500 })
  }
}

async function auditBatch(candidates: CandidateInput[]): Promise<ClaudeAuditRow[]> {
  const list = candidates.map((c) => ({
    idx: c.idx,
    name: c.name,
    chapter: c.chapter,
    topic: c.topic,
    brief: c.brief_excerpt,
  }))

  const systemPrompt = `Tu es un radiologue expert et coach FMH2 suisse. Tu vas auditer une liste de briefs d'étude radiologique. Pour CHAQUE entité, évalue si le brief est complet et bien structuré pour préparer l'examen FMH2.

Critères d'audit — flag un manque si UN de ces points est vrai :
- **DDx incomplet** : une cause fréquente et cliniquement importante manque dans la liste (exemple : brief sur le nerf optique sans mentionner la SEP / névrite démyélinisante ; brief sur masses médiastinales antérieures sans thymome).
- **Perle cruciale manquante** : un signe pathognomonique ou une règle d'or FMH2 est absente alors qu'elle aurait dû y être (exemple : restriction de diffusion pour un abcès cérébral, signe du "double halo" pour dissection aortique).
- **Section vide ou squelettique** : une section importante (Matrice modalités, Template oral, Perles) est absente ou contient moins de 2 items utiles.
- **Regroupement étiologique possible** : la liste DDx n'est pas groupée par thème alors qu'elle le pourrait (exemple : DDx nerf optique = Inflammatoire [névrite, SEP] / Compressif [méningiome, gliome] / Infiltratif [lymphome, sarcoïdose]). Si le regroupement apporterait de la clarté, propose-le.

Si tout est OK → status: "ok", gaps: [], suggested_grouping: null.
Si au moins un critère flag → status: "needs_fix".

Pour chaque gap, sois SPÉCIFIQUE et ACTIONNABLE (pas "le brief est incomplet" mais "manque SEP/névrite démyélinisante comme cause fréquente inflammatoire"). Maximum 4 gaps par entité.

Pour suggested_grouping : une phrase courte au format "Thème1 → Thème2 → Thème3" si pertinent, sinon null.

Renvoie UNIQUEMENT un JSON array, un objet par entité dans l'ordre fourni :
[{"idx": 0, "status": "ok"|"needs_fix", "gaps": ["..."], "suggested_grouping": "..."|null}, ...]

Pas de texte avant/après. Pas de fence \`\`\`.`

  const userMessage = JSON.stringify(list)

  const response = await callClaude(systemPrompt, userMessage, 4096)
  try {
    const parsed = parseClaudeJSON<ClaudeAuditRow[]>(response)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('Audit batch parse error:', err, 'response:', response.substring(0, 500))
    return []
  }
}
