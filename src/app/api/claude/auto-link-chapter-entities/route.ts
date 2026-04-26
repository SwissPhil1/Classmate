import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'
import { parseSections } from '@/lib/brief-parsing'

/**
 * For each entity in the chapter, find the best matching `## Section` in the
 * chapter manual and write `entities.manual_section_anchor`. Asks Claude in a
 * single call to suggest the mapping for all entities at once (cheap, ~1k
 * tokens output).
 *
 * Returns `{ linked: [{ entity_id, entity_name, anchor }], unmatched: [...] }`.
 */
export const maxDuration = 30

interface MappingItem {
  entity_id: string
  anchor: string | null
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { chapter_id } = await request.json()
    if (!chapter_id || typeof chapter_id !== 'string') {
      return NextResponse.json({ error: 'chapter_id required' }, { status: 400 })
    }

    const { data: chapter, error: chErr } = await supabase
      .from('chapters')
      .select('id, name, manual_content')
      .eq('id', chapter_id)
      .single()
    if (chErr || !chapter) {
      return NextResponse.json({ error: 'Chapter not found' }, { status: 404 })
    }
    if (!chapter.manual_content || chapter.manual_content.trim().length === 0) {
      return NextResponse.json({ error: 'Chapter has no manual yet' }, { status: 400 })
    }

    const sections = parseSections(chapter.manual_content)
    const sectionTitles = sections.map((s) => s.title.trim()).filter(Boolean)
    if (sectionTitles.length === 0) {
      return NextResponse.json({ error: 'Manual has no ## sections' }, { status: 400 })
    }

    const { data: entities, error: enErr } = await supabase
      .from('entities')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('chapter_id', chapter_id)
    if (enErr) {
      return NextResponse.json({ error: enErr.message }, { status: 500 })
    }
    if (!entities || entities.length === 0) {
      return NextResponse.json({ linked: [], unmatched: [] })
    }

    // Try a fast exact-match pass first — saves a Claude call when entity
    // names already match section titles verbatim.
    const titleSet = new Set(sectionTitles)
    const exact: MappingItem[] = []
    const ambiguous: { id: string; name: string }[] = []
    for (const e of entities) {
      if (titleSet.has(e.name.trim())) {
        exact.push({ entity_id: e.id, anchor: e.name.trim() })
      } else {
        ambiguous.push({ id: e.id, name: e.name })
      }
    }

    let claudeMappings: MappingItem[] = []
    if (ambiguous.length > 0) {
      const systemPrompt = `Tu lies des entités d'étude radiologique aux sections d'un manuel de chapitre.

SECTIONS DISPONIBLES (ancres exactes):
${sectionTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

ENTITÉS À LIER:
${ambiguous.map((e, i) => `${i + 1}. id="${e.id}" name="${e.name}"`).join('\n')}

POUR CHAQUE ENTITÉ, choisis la section la plus appropriée (l'entité doit y être traitée comme sujet principal). Si AUCUNE section ne correspond clairement, mets "anchor": null.

FORMAT — JSON STRICT, rien d'autre:
{"mappings": [{"entity_id": "...", "anchor": "<titre exact ou null>"}, ...]}

L'anchor DOIT être copié-collé depuis la liste de sections (chaîne identique). Pas de markdown, pas de fence.`

      const response = await callClaude(systemPrompt, 'Produis le mapping JSON.', 2048)
      try {
        const parsed = parseClaudeJSON<{ mappings: MappingItem[] }>(response)
        claudeMappings = (parsed.mappings ?? []).filter(
          (m) =>
            typeof m.entity_id === 'string' &&
            (m.anchor === null || (typeof m.anchor === 'string' && titleSet.has(m.anchor)))
        )
      } catch (err) {
        console.error('auto-link parse error:', err, response.substring(0, 300))
      }
    }

    // Combine exact + Claude. Then bulk-update entities.
    const allMappings = [...exact, ...claudeMappings]
    const linked: { entity_id: string; entity_name: string; anchor: string }[] = []
    const unmatched: { entity_id: string; entity_name: string }[] = []

    const entityById = new Map(entities.map((e) => [e.id, e]))
    for (const m of allMappings) {
      const ent = entityById.get(m.entity_id)
      if (!ent) continue
      if (m.anchor) {
        const { error: upErr } = await supabase
          .from('entities')
          .update({ manual_section_anchor: m.anchor })
          .eq('id', m.entity_id)
          .eq('user_id', user.id)
        if (upErr) {
          console.error('auto-link update error:', upErr)
          continue
        }
        linked.push({ entity_id: m.entity_id, entity_name: ent.name, anchor: m.anchor })
      } else {
        unmatched.push({ entity_id: m.entity_id, entity_name: ent.name })
      }
    }

    // Entities not in any mapping → unmatched.
    const handled = new Set(allMappings.map((m) => m.entity_id))
    for (const e of entities) {
      if (!handled.has(e.id)) unmatched.push({ entity_id: e.id, entity_name: e.name })
    }

    return NextResponse.json({ linked, unmatched })
  } catch (err) {
    console.error('auto-link-chapter-entities error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
