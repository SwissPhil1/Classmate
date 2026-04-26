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
  chapter_id: string
  chapter: string
  topic: string
  brief_excerpt: string
}

interface ClaudeAuditRow {
  idx: number
  status: 'ok' | 'needs_fix'
  gaps: string[]
  suggested_grouping: string | null
  suggested_chapter_id: string | null
}

interface ChapterOption {
  id: string
  name: string
  topic: string
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

    const [entitiesRes, chaptersRes] = await Promise.all([
      supabase
        .from('entities')
        .select('id, name, chapter_id, chapter:chapters(name, topic:topics(name)), brief:briefs(content)')
        .eq('user_id', user.id)
        .order('name'),
      supabase
        .from('chapters')
        .select('id, name, topic:topics(name)')
        .order('name'),
    ])
    if (entitiesRes.error) throw entitiesRes.error
    if (chaptersRes.error) throw chaptersRes.error
    const rawEntities = entitiesRes.data
    const chapterOptions: ChapterOption[] = (chaptersRes.data ?? []).map((c) => {
      const topic = Array.isArray(c.topic) ? c.topic[0] : c.topic
      return {
        id: c.id as string,
        name: c.name as string,
        topic: topic?.name ?? '',
      }
    })
    const chapterMap = new Map(chapterOptions.map((c) => [c.id, c]))

    type RawEntity = {
      id: string
      name: string
      chapter_id: string
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
        chapter_id: e.chapter_id,
        chapter: chapter?.name ?? '',
        topic: chapter?.topic?.name ?? '',
        brief_excerpt: (brief?.content ?? '').substring(0, MAX_BRIEF_CHARS),
      }
    })

    const newItems: BriefAuditItem[] = []
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE)
      const rows = await auditBatch(batch, chapterOptions)
      for (const row of rows) {
        const cand = batch[row.idx]
        if (!cand) continue
        // Validate suggested_chapter_id: must exist and differ from current
        let suggestedChapterId: string | null = null
        let suggestedChapterName: string | null = null
        let suggestedChapterTopic: string | null = null
        if (
          typeof row.suggested_chapter_id === 'string' &&
          row.suggested_chapter_id !== cand.chapter_id &&
          chapterMap.has(row.suggested_chapter_id)
        ) {
          const opt = chapterMap.get(row.suggested_chapter_id)!
          suggestedChapterId = opt.id
          suggestedChapterName = opt.name
          suggestedChapterTopic = opt.topic
        }
        newItems.push({
          entity_id: cand.id,
          status: row.status === 'needs_fix' ? 'needs_fix' : 'ok',
          gaps: Array.isArray(row.gaps) ? row.gaps.filter((g) => typeof g === 'string') : [],
          suggested_grouping: typeof row.suggested_grouping === 'string' && row.suggested_grouping.trim() ? row.suggested_grouping.trim() : null,
          suggested_chapter_id: suggestedChapterId,
          suggested_chapter_name: suggestedChapterName,
          suggested_chapter_topic: suggestedChapterTopic,
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

async function auditBatch(
  candidates: CandidateInput[],
  chapterOptions: ChapterOption[]
): Promise<ClaudeAuditRow[]> {
  const list = candidates.map((c) => ({
    idx: c.idx,
    name: c.name,
    current_chapter_id: c.chapter_id,
    current_chapter: c.chapter,
    topic: c.topic,
    brief: c.brief_excerpt,
  }))

  const chaptersBlock = chapterOptions
    .map((c) => `- ${c.id} · "${c.name}" (topic: ${c.topic})`)
    .join('\n')

  const systemPrompt = `Tu es un radiologue expert et coach FMH2 suisse. Tu vas auditer une liste de briefs d'étude radiologique. Pour CHAQUE entité, évalue si le brief est complet et bien structuré pour préparer l'examen FMH2, ET si l'entité est bien classée dans le bon chapitre.

Critères d'audit — flag un manque (status: "needs_fix") si UN de ces points est vrai :
- **DDx incomplet** : une cause fréquente et cliniquement importante manque dans la liste (exemple : brief sur le nerf optique sans mentionner la SEP / névrite démyélinisante ; brief sur masses médiastinales antérieures sans thymome).
- **Perle cruciale manquante** : un signe pathognomonique ou une règle d'or FMH2 est absente alors qu'elle aurait dû y être (exemple : restriction de diffusion pour un abcès cérébral, signe du "double halo" pour dissection aortique).
- **Section vide ou squelettique** : une section importante (Matrice modalités, Template oral, Perles) est absente ou contient moins de 2 items utiles.
- **Regroupement étiologique possible** : la liste DDx n'est pas groupée par thème alors qu'elle le pourrait (exemple : DDx nerf optique = Inflammatoire [névrite, SEP] / Compressif [méningiome, gliome] / Infiltratif [lymphome, sarcoïdose]).

Pour chaque gap, sois SPÉCIFIQUE et ACTIONNABLE. Max 4 gaps par entité.

Pour suggested_grouping : phrase courte "Thème1 → Thème2 → Thème3" si pertinent, sinon null.

**Classification par chapitre** : voici la liste des chapitres disponibles (id · "nom" · topic) :
${chaptersBlock}

Pour chaque entité, vérifie si son current_chapter_id est pertinent. Si l'entité serait mieux classée dans un autre chapitre de la liste ci-dessus, renvoie son id dans \`suggested_chapter_id\`. Sois conservateur : ne suggère un déplacement QUE si le chapitre actuel est clairement inadapté (exemple : "Gliome optique" dans "Cardiovasculaire" — évident). Si le chapitre actuel est raisonnable, renvoie null. Ne JAMAIS renvoyer current_chapter_id (ce serait no-op).

Renvoie UNIQUEMENT un JSON array :
[{"idx": 0, "status": "ok"|"needs_fix", "gaps": ["..."], "suggested_grouping": "..."|null, "suggested_chapter_id": "uuid"|null}, ...]

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
