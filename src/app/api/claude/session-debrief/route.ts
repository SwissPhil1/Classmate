import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

interface EntitySummary {
  entity_name: string
  topic_name: string
  chapter_name: string
  results: { result: string; question: string; feedback: string | null }[]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const { mode } = body

    if (mode === 'history') {
      // ─── History analysis: weak topic identification + key reminders ───
      const { summaries, period, total_correct, total_partial, total_wrong } = body as {
        summaries: EntitySummary[]
        period: string
        total_correct: number
        total_partial: number
        total_wrong: number
      }

      const total = total_correct + total_partial + total_wrong
      if (total === 0) {
        return NextResponse.json({ error: 'Aucun résultat à analyser' }, { status: 400 })
      }

      const systemPrompt = `Tu es un tuteur expert en radiologie FMH2 suisse. L'étudiant te montre ses résultats d'étude pour identifier ses points faibles et les réviser immédiatement.

TON OBJECTIF : Identifier les sujets les plus faibles et fournir des rappels flash pour activer la rétention MAINTENANT.

FORMAT STRICT À SUIVRE :

1. Commence par une ligne de résumé : "X sujets fragiles sur Y testés"

2. Pour chaque sujet faible (partiel ou incorrect), utilise exactement ce format :

**🔴 [Nom du sujet]** (résultat)
- **Point clé 1** : [rappel concis — le critère discriminant ou le piège principal]
- **Point clé 2** : [un autre point essentiel]
- **Mnémo** : [astuce mémoire si pertinente, ex: acronyme, association]

3. Termine par "✅ Sujets maîtrisés : [liste courte]" si il y en a.

RÈGLES :
- Maximum 3-4 sujets faibles détaillés (les pires d'abord)
- 2-3 points clés par sujet, PAS PLUS
- Chaque point clé = 1 ligne, concis et spécifique (critère discriminant, diagnostic différentiel clé, signe pathognomonique)
- PAS de paragraphes, PAS de conseils méthodologiques génériques, PAS de commentaires sur les réponses tapées
- L'objectif est que l'étudiant relise cette analyse en 30 secondes et retienne les points discriminants
- Sois un aide-mémoire, pas un rapport`

      // Group summaries by topic
      const topicGroups = new Map<string, EntitySummary[]>()
      for (const s of summaries) {
        const topic = s.topic_name || 'Autre'
        if (!topicGroups.has(topic)) topicGroups.set(topic, [])
        topicGroups.get(topic)!.push(s)
      }

      // Format the data per topic — focus on entity names and results
      const topicTexts = Array.from(topicGroups.entries()).map(([topic, entities]) => {
        const entityLines = entities.map(e => {
          const counts = {
            correct: e.results.filter(r => r.result === 'correct').length,
            partial: e.results.filter(r => r.result === 'partial').length,
            wrong: e.results.filter(r => r.result === 'wrong').length,
          }
          const resultStr = [
            counts.correct > 0 ? `${counts.correct}✓` : '',
            counts.partial > 0 ? `${counts.partial}~` : '',
            counts.wrong > 0 ? `${counts.wrong}✗` : '',
          ].filter(Boolean).join(' ')

          return `- ${e.entity_name} : ${resultStr}`
        }).join('\n')

        return `### ${topic}\n${entityLines}`
      }).join('\n\n')

      const userMessage = `${period} — ${total} questions : ${total_correct}✓ ${total_partial}~ ${total_wrong}✗

${topicTexts}`

      const response = await callClaude(systemPrompt, userMessage, 1500)
      return NextResponse.json({ analysis: response })
    }

    // ─── Session debrief: original behavior ───
    const { errors, session_type } = body

    if (!errors || errors.length === 0) {
      return NextResponse.json({ error: 'Aucune erreur à analyser' }, { status: 400 })
    }

    const sessionLabel = session_type === 'weekend' ? 'session weekend'
      : session_type === 'weak_items' ? 'consolidation des fragiles'
      : session_type === 'weekly_review' ? 'révision hebdomadaire'
      : 'session d\'étude'

    const systemPrompt = `Tu es un tuteur expert en radiologie FMH2 suisse. L'étudiant vient de terminer une ${sessionLabel}.
Analyse ses erreurs (réponses partielles et incorrectes) pour identifier:

1. **Patterns d'erreur** : Y a-t-il un thème commun ? (ex: confusion entre deux pathologies, oubli systématique d'un critère, mauvaise approche sémiologique)
2. **Points discriminants manqués** : Pour chaque erreur, quel est LE critère clé que l'étudiant aurait dû retenir ?
3. **Recommandation concrète** : 2-3 actions spécifiques pour la prochaine session

Format ta réponse en markdown structuré, en français. Sois direct et spécifique — pas de généralités.
Limite-toi à 500 mots maximum.`

    const errorSummaries = errors.map((e: { entity_name: string; question: string; user_answer: string | null; feedback: string | null; result: string }, i: number) =>
      `### Erreur ${i + 1}: ${e.entity_name || 'Entité inconnue'}
Question: ${e.question}
Réponse de l'étudiant: ${e.user_answer || '(réponse orale, auto-évalué)'}
Résultat: ${e.result === 'wrong' ? 'Incorrect' : 'Partiel'}
Feedback: ${e.feedback || '(pas de feedback)'}`
    ).join('\n\n')

    const userMessage = `Voici les ${errors.length} erreurs de cette session:\n\n${errorSummaries}`

    const response = await callClaude(systemPrompt, userMessage, 2048)

    return NextResponse.json({ analysis: response })
  } catch (error) {
    console.error('Session debrief error:', error)
    return NextResponse.json(
      { error: 'Analyse indisponible temporairement' },
      { status: 500 }
    )
  }
}
