import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import type { ClaudeEvaluateResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const { entity_name, question, model_answer, key_points, user_answer, question_type } = await request.json()

    const systemPrompt = `Évalue cette réponse d'examen FMH2 strictement.
Entité: ${entity_name}
Question: ${question}
Réponse modèle: ${model_answer}
Points clés requis: ${JSON.stringify(key_points)}
Réponse du candidat: ${user_answer}
Type: ${question_type}

Pour Format C (réponse libre): évaluer aussi la structure (introduction, développement, conclusion) et la complétude.

Retourne UNIQUEMENT un JSON valide, sans markdown ni texte additionnel:
{
  "result": "correct" ou "partial" ou "wrong",
  "feedback": "string (max 2 phrases, spécifique, en français)",
  "missing": ["points non abordés"],
  "oral_tip": "string ou null (conseil présentation orale si pertinent)"
}`

    const userMessage = `Évalue cette réponse maintenant.`

    const response = await callClaude(systemPrompt, userMessage, 1024)
    const parsed = parseClaudeJSON<ClaudeEvaluateResponse>(response)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Evaluation error:', error)
    return NextResponse.json(
      { error: 'Évaluation indisponible temporairement' },
      { status: 500 }
    )
  }
}
