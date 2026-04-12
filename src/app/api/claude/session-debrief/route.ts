import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { errors, session_type } = await request.json()

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
Réponse de l'étudiant: ${e.user_answer || '(pas de réponse)'}
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
