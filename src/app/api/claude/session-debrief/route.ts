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
      // ─── History analysis: topic performance patterns ───
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

      const systemPrompt = `Tu es un tuteur expert en radiologie FMH2 suisse. L'étudiant te présente ses résultats d'étude.

Analyse ses performances pour fournir :

1. **Bilan par thème** : Quels sujets sont maîtrisés vs fragiles ? Base-toi sur les résultats (correct/partiel/incorrect), PAS sur le contenu des réponses tapées.
2. **Rappels clés** : Pour chaque thème problématique (partiel ou incorrect), donne 2-3 rappels essentiels : critères discriminants, pièges classiques, points à retenir. Sois spécifique au sujet (pas de conseils génériques).
3. **Priorités** : Quels sujets revoir en priorité ?

IMPORTANT :
- L'étudiant répond souvent à l'oral puis s'auto-évalue (correct/partiel/incorrect). Ne commente JAMAIS l'absence de réponse tapée.
- Concentre-toi uniquement sur les RÉSULTATS et les SUJETS, pas sur la forme des réponses.
- Pour les rappels, sois concis mais précis — l'objectif est d'aider à mémoriser les points discriminants.

Format markdown structuré, en français. Sois direct et utile.
Limite-toi à 600 mots maximum.`

      // Group summaries by topic
      const topicGroups = new Map<string, EntitySummary[]>()
      for (const s of summaries) {
        const topic = s.topic_name || 'Autre'
        if (!topicGroups.has(topic)) topicGroups.set(topic, [])
        topicGroups.get(topic)!.push(s)
      }

      // Format the data per topic
      const topicTexts = Array.from(topicGroups.entries()).map(([topic, entities]) => {
        const topicCorrect = entities.reduce((n, e) => n + e.results.filter(r => r.result === 'correct').length, 0)
        const topicPartial = entities.reduce((n, e) => n + e.results.filter(r => r.result === 'partial').length, 0)
        const topicWrong = entities.reduce((n, e) => n + e.results.filter(r => r.result === 'wrong').length, 0)

        const entityLines = entities.map(e => {
          const counts = {
            correct: e.results.filter(r => r.result === 'correct').length,
            partial: e.results.filter(r => r.result === 'partial').length,
            wrong: e.results.filter(r => r.result === 'wrong').length,
          }
          const resultStr = [
            counts.correct > 0 ? `${counts.correct} correct` : '',
            counts.partial > 0 ? `${counts.partial} partiel` : '',
            counts.wrong > 0 ? `${counts.wrong} incorrect` : '',
          ].filter(Boolean).join(', ')

          // Include feedback from wrong/partial for context
          const feedbackLines = e.results
            .filter(r => r.result !== 'correct' && r.feedback)
            .slice(0, 2)
            .map(r => `  Feedback: ${r.feedback}`)
            .join('\n')

          return `- ${e.entity_name} : ${resultStr}${feedbackLines ? '\n' + feedbackLines : ''}`
        }).join('\n')

        return `### ${topic} (${topicCorrect} correct, ${topicPartial} partiel, ${topicWrong} incorrect)\n${entityLines}`
      }).join('\n\n')

      const userMessage = `Période : ${period}
${total} questions au total : ${total_correct} correct, ${total_partial} partiel, ${total_wrong} incorrect

Résultats par thème :

${topicTexts}`

      const response = await callClaude(systemPrompt, userMessage, 2048)
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
