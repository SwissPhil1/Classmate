import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

/**
 * Extract study entities from a chapter manual. Given the manual's markdown
 * content plus the list of available `## Section` headings, asks Claude to
 * enumerate the discrete radiological diagnoses / concepts / protocols worth
 * studying as their own SRS cards, each tied to its source section.
 *
 * Output shape:
 *   { entities: [{ name, section_anchor, entity_type, reason }] }
 *
 * `entity_type` ∈ {'single_diagnosis', 'ddx_pair', 'concept', 'protocol'}.
 * Never returns 'mnemonic' — mnemonics continue to live as flags on other
 * entities (they will get their own first-class treatment in a later pass).
 */
export const maxDuration = 60

interface ExtractedEntity {
  name: string
  section_anchor: string
  entity_type: 'single_diagnosis' | 'ddx_pair' | 'concept' | 'protocol'
  reason?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { manual_content, chapter_name, topic_name, section_anchors } = await request.json()
    if (!manual_content || typeof manual_content !== 'string') {
      return NextResponse.json({ error: 'manual_content required' }, { status: 400 })
    }
    if (!Array.isArray(section_anchors) || section_anchors.length === 0) {
      return NextResponse.json({ error: 'section_anchors required' }, { status: 400 })
    }

    const anchorsList = (section_anchors as string[])
      .map((a, i) => `${i + 1}. ${a}`)
      .join('\n')

    const systemPrompt = `Tu extrais des entités d'étude à partir d'un manuel de chapitre de radiologie.

CONTEXTE:
- Thème: ${topic_name || '(non spécifié)'}
- Chapitre: ${chapter_name || '(non spécifié)'}

SECTIONS DISPONIBLES (ancres exactes):
${anchorsList}

TA TÂCHE:
Identifie chaque ENTITÉ d'étude distincte dans ce manuel. Une entité = une unité de révision autonome qui mérite sa propre carte SRS et son propre brief ciblé. Pour CHAQUE entité:
- \`name\`: nom court et précis en français (ex: "Carcinome à cellules rénales (RCC)", "Bosniak 2019", "Rein en fer à cheval", "Phéochromocytome")
- \`section_anchor\`: EXACTEMENT le nom de la section qui la contient, choisi dans la liste ci-dessus
- \`entity_type\`: un de {single_diagnosis, ddx_pair, concept, protocol}
  - single_diagnosis = UN diagnostic précis (ex: RCC, AML, Phéochromocytome, Rein en fer à cheval)
  - ddx_pair = une liste de DDx groupés (ex: "Masses rénales solides", "Défauts de remplissage vésicaux", "Sténoses urétrales")
  - concept = une classification, un score, un signe, une règle (ex: "Bosniak 2019", "AAST 2018", "PI-RADS v2.1", "Règle des 10", "Signe du cortical rim")
  - protocol = un protocole d'imagerie (ex: "Washout adrenal CT", "Uro-TDM 4 phases")
- \`reason\`: 1 phrase courte justifiant pourquoi c'est une entité autonome (optionnel, aide au review)

RÈGLES STRICTES:
1. Ne crée PAS d'entité pour les sections purement méta (tables des matières, "Méta-règles oral" = section contexte, pas une entité — saute-la).
2. Préfère 1 entité bien définie à 3 entités fragmentées. Regroupe les variantes d'un même diagnostic.
3. Ne crée PAS d'entité pour une mnémonique seule (ex: COAT, POSTCARDS) — celles-ci seront traitées à part.
4. Chaque entité doit matérialiser un concept qu'un candidat FMH2 devrait pouvoir réciter en 90 secondes à l'oral.
5. Le \`section_anchor\` DOIT être identique à un élément de la liste ci-dessus (copie-colle).
6. Vise 10-25 entités pour un manuel complet. Moins = tu rates du contenu. Plus = tu sur-fragmentes.

FORMAT DE SORTIE — JSON STRICT, rien d'autre:
{"entities": [{"name": "...", "section_anchor": "...", "entity_type": "...", "reason": "..."}, ...]}

Pas de markdown, pas de fence \`\`\`, pas de texte avant/après.`

    const userMessage = `MANUEL À ANALYSER:\n\n${manual_content}`

    const response = await callClaude(systemPrompt, userMessage, 4096)

    let parsed: { entities: ExtractedEntity[] }
    try {
      parsed = parseClaudeJSON<{ entities: ExtractedEntity[] }>(response)
    } catch (err) {
      console.error('Extract entities parse error:', err, 'response:', response.substring(0, 500))
      return NextResponse.json({ error: 'Format de réponse Claude invalide' }, { status: 500 })
    }

    const allowedAnchors = new Set(section_anchors as string[])
    const allowedTypes = new Set(['single_diagnosis', 'ddx_pair', 'concept', 'protocol'])

    const cleaned: ExtractedEntity[] = (parsed.entities ?? [])
      .filter((e) => typeof e.name === 'string' && e.name.trim().length > 0)
      .filter((e) => typeof e.section_anchor === 'string' && allowedAnchors.has(e.section_anchor))
      .filter((e) => allowedTypes.has(e.entity_type))
      .map((e) => ({
        name: e.name.trim(),
        section_anchor: e.section_anchor,
        entity_type: e.entity_type,
        reason: typeof e.reason === 'string' ? e.reason.trim() : undefined,
      }))

    return NextResponse.json({ entities: cleaned })
  } catch (err) {
    console.error('extract-entities-from-manual error:', err)
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
