import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import type { ClaudeQuestionResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const { entity_name, entity_type, cycle_count, difficulty_level, chapter, topic, exam_component } = await request.json()

    const systemPrompt = `Génère une question de re-test froid niveau FMH2 sur: ${entity_name}.
Difficulté ${difficulty_level}, cycle ${cycle_count}.

Règles de difficulté:
1: Présentation classique, cas typique
2: Présentation atypique ou différenciation avec un mimique proche
3: Intégration de plusieurs signes ou décision de prise en charge

Règles de type:
- single_diagnosis → Format A (réponse tapée)
- ddx_pair → Format B (réponse orale ouverte)
- concept → Format A
- protocol → Format A ou B
- Si exam_component inclut 'written' ET cycle >2: 10% chance Format C (réponse libre paragraphe)

NE PAS répéter les questions du brief (cycle 1).
À partir du cycle 2, générer des questions nouvelles.

Retourne UNIQUEMENT un JSON valide, sans markdown ni texte additionnel:
{
  "type": "A" ou "B" ou "C",
  "question": "string (en français)",
  "model_answer": "string (en français)",
  "key_points": ["string"],
  "difficulty_used": number
}`

    const userMessage = `Entité: ${entity_name}
Type: ${entity_type}
Cycle: ${cycle_count}
Difficulté: ${difficulty_level}
Chapitre: ${chapter}
Thème: ${topic}
Composante d'examen: ${exam_component}`

    const response = await callClaude(systemPrompt, userMessage, 2048)
    const parsed = parseClaudeJSON<ClaudeQuestionResponse>(response)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Question generation error:', error)
    return NextResponse.json(
      { error: 'Génération indisponible temporairement' },
      { status: 500 }
    )
  }
}
