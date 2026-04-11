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

    const { entity_name, reference_text } = await request.json()

    if (!reference_text || !reference_text.includes('--- AJOUT ---')) {
      return NextResponse.json({ error: 'Rien à consolider' }, { status: 400 })
    }

    const systemPrompt = `Tu es un assistant médical. Voici du texte de référence médical pour "${entity_name}", composé de plusieurs ajouts successifs séparés par "--- AJOUT ---".

Fusionne-le en un texte UNIQUE, cohérent et sans redondance.

Règles:
- Garde TOUS les faits médicaux — ne rien supprimer
- Élimine les doublons et redondances
- Organise par thème (imagerie, clinique, DDx, épidémiologie, etc.)
- Garde le même niveau de détail que l'original
- Ne pas inventer ou ajouter de faits absents des sources
- Texte en français
- Format texte brut (pas de markdown), prêt à être utilisé comme reference_text

Texte à consolider:
${reference_text}`

    const consolidated = await callClaude(systemPrompt, 'Consolide ce texte de référence.', 4096)

    return NextResponse.json({ consolidated_text: consolidated.trim() })
  } catch (error) {
    console.error('Consolidation error:', error)
    return NextResponse.json(
      { error: 'Consolidation indisponible temporairement' },
      { status: 500 }
    )
  }
}
