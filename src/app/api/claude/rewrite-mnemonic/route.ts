import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

/**
 * Rewrite only the "Mnémonique & DDx structuré" section of a brief based on
 * user feedback. The rest of the brief is preserved verbatim.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_id, user_feedback } = await request.json()
    if (!entity_id || typeof user_feedback !== 'string' || !user_feedback.trim()) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    // Fetch entity + brief
    const { data: entity, error: entErr } = await supabase
      .from('entities')
      .select('id, name, entity_type, reference_text, notes, chapter:chapters(name, topic:topics(name))')
      .eq('id', entity_id)
      .eq('user_id', user.id)
      .single()
    if (entErr || !entity) {
      return NextResponse.json({ error: 'Entité introuvable' }, { status: 404 })
    }

    const { data: briefRow, error: briefErr } = await supabase
      .from('briefs')
      .select('id, content')
      .eq('entity_id', entity_id)
      .single()
    if (briefErr || !briefRow) {
      return NextResponse.json({ error: 'Brief introuvable' }, { status: 404 })
    }

    const currentContent: string = briefRow.content
    const { newContent, rewritten } = await rewriteMnemonicSection(
      currentContent,
      entity as EntityForRewrite,
      user_feedback.trim()
    )

    if (!rewritten) {
      return NextResponse.json(
        { error: "Aucune section Mnémonique trouvée dans le brief." },
        { status: 422 }
      )
    }

    const { error: updErr } = await supabase
      .from('briefs')
      .update({ content: newContent })
      .eq('id', briefRow.id)
    if (updErr) throw updErr

    return NextResponse.json({ content: newContent })
  } catch (error) {
    console.error('Rewrite mnemonic error:', error)
    return NextResponse.json({ error: 'Réécriture indisponible temporairement' }, { status: 500 })
  }
}

type EntityForRewrite = {
  name: string
  entity_type: string
  reference_text: string | null
  notes: string | null
  chapter?: { name?: string; topic?: { name?: string } | null } | { name?: string; topic?: { name?: string } | null }[] | null
}

/**
 * Find the "## Mnémonique..." section in markdown, ask Claude to rewrite it, and
 * splice the result back in. Returns unchanged content if the section can't be
 * located.
 */
async function rewriteMnemonicSection(
  currentContent: string,
  entity: EntityForRewrite,
  userFeedback: string
): Promise<{ newContent: string; rewritten: boolean }> {
  // Locate a section whose header starts with "## Mnémonique" (or close variants)
  const headerRegex = /^## [Mm]n[ée]moni[qQ]ue[^\n]*/m
  const startMatch = currentContent.match(headerRegex)
  if (!startMatch || startMatch.index === undefined) {
    return { newContent: currentContent, rewritten: false }
  }

  const sectionStart = startMatch.index
  const afterHeader = sectionStart + startMatch[0].length
  const nextHeaderMatch = currentContent.substring(afterHeader).match(/\n## /)
  const sectionEnd = nextHeaderMatch
    ? afterHeader + (nextHeaderMatch.index as number)
    : currentContent.length

  const originalSection = currentContent.substring(sectionStart, sectionEnd).trim()

  const chapterObj = Array.isArray(entity.chapter) ? entity.chapter[0] : entity.chapter
  const topicName = chapterObj?.topic?.name ?? ''
  const chapterName = chapterObj?.name ?? ''

  const systemPrompt = `Tu es un radiologue expert et coach FMH2 suisse. L'utilisateur n'est pas satisfait de la section "Mnémonique & DDx structuré" actuelle pour cette entité et souhaite la réécrire.

Entité: ${entity.name} (type: ${entity.entity_type}, thème: ${topicName}, chapitre: ${chapterName}).

SECTION ACTUELLE:
${originalSection}

FEEDBACK DU CANDIDAT:
${userFeedback}

${entity.reference_text ? `RÉFÉRENCE (faits médicaux à respecter):\n${entity.reference_text.substring(0, 3000)}\n` : ''}
${entity.notes ? `NOTES PERSO DU CANDIDAT:\n${entity.notes}\n` : ''}

Instructions:
- Réécris UNIQUEMENT la section "## Mnémonique & DDx structuré" en tenant compte du feedback.
- Conserve le titre "## Mnémonique & DDx structuré" tel quel.
- Si une mnémonique publiée SPÉCIFIQUE existe (MEGA, TORCH, FEGNOMASHIC, etc.), privilégie-la. NE PAS utiliser VINDICATE comme mnémonique principale.
- Si aucune mnémonique spécifique n'est adaptée, propose plutôt une liste DDx structurée par fréquence avec un critère discriminant par ligne.
- Tout en français, niveau FMH2.
- Ne génère AUCUN autre texte, pas de commentaire, pas de "Voici la section réécrite:". Renvoie directement le markdown de la section (à partir de "## Mnémonique...").`

  const userMessage = `Réécris la section mnémonique pour ${entity.name} selon le feedback.`
  let rewrittenSection = (await callClaude(systemPrompt, userMessage, 2048)).trim()

  // Strip any accidental code fence
  if (rewrittenSection.startsWith('```')) {
    rewrittenSection = rewrittenSection.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  // Ensure it starts with the expected heading
  if (!/^## [Mm]n[ée]moni[qQ]ue/.test(rewrittenSection)) {
    rewrittenSection = `## Mnémonique & DDx structuré\n${rewrittenSection}`
  }

  const before = currentContent.substring(0, sectionStart).replace(/\s+$/, '')
  const after = currentContent.substring(sectionEnd).replace(/^\s+/, '')
  const newContent = [before, rewrittenSection, after].filter(Boolean).join('\n\n')

  return { newContent, rewritten: true }
}
