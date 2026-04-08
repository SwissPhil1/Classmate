import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const { results, week_number, total_weeks } = await request.json()

    const systemPrompt = `Analyse ces résultats d'étude radiologie FMH2 pour la semaine ${week_number} sur ${total_weeks}.
Identifie: chapitres les plus solides, chapitres les plus faibles, patterns d'erreur récurrents, entités encore actives après plusieurs tentatives.
Sois direct et spécifique.
Output: markdown structuré avec recommandation de focus pour la semaine prochaine.
Tout en français.`

    const userMessage = `Résultats de la semaine:\n${JSON.stringify(results, null, 2)}`

    const response = await callClaude(systemPrompt, userMessage, 2048)

    return NextResponse.json({ analysis: response })
  } catch (error) {
    console.error('Weekly pattern error:', error)
    return NextResponse.json(
      { error: 'Analyse indisponible temporairement' },
      { status: 500 }
    )
  }
}
