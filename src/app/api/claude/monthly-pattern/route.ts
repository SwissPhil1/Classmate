import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const { results, entities, month_number } = await request.json()

    const systemPrompt = `Analyse ces résultats d'étude radiologie FMH2 pour le mois ${month_number}.
Output structuré:
1. Entités consolidées vs actives par thème
2. Faiblesses systématiques identifiées
3. Préparation examen ÉCRIT: niveau estimé + gaps
4. Préparation examen ORAL: niveau estimé + gaps
5. Recommandations prioritaires mois suivant
Tout en français, direct, sans fioriture.`

    const userMessage = `Résultats du mois:\n${JSON.stringify(results, null, 2)}\n\nStatut des entités:\n${JSON.stringify(entities, null, 2)}`

    const response = await callClaude(systemPrompt, userMessage, 3072)

    return NextResponse.json({ analysis: response })
  } catch (error) {
    console.error('Monthly pattern error:', error)
    return NextResponse.json(
      { error: 'Analyse indisponible temporairement' },
      { status: 500 }
    )
  }
}
