import { NextRequest, NextResponse } from 'next/server'
import { callClaude, parseClaudeJSON } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { entity_name, reference_text } = await request.json()

    // Fetch all user entities with briefs
    const { data: entities, error } = await supabase
      .from('entities')
      .select('id, name, entity_type, chapter:chapters(name, topic:topics(name)), brief:briefs(id)')
      .eq('user_id', user.id)

    if (error) throw error
    if (!entities || entities.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    // Build a list of existing entity names for Claude to compare
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingNames = entities.map((e: any) => {
      const ch = Array.isArray(e.chapter) ? e.chapter[0] : e.chapter
      return {
        id: e.id,
        name: e.name,
        entity_type: e.entity_type,
        has_brief: !!(e.brief && (Array.isArray(e.brief) ? e.brief.length > 0 : e.brief)),
        chapter: ch?.name || '?',
        topic: ch?.topic?.name || '?',
      }
    })

    const systemPrompt = `Tu es un assistant médical. Analyse si la nouvelle entité de radiologie correspond ou chevauche des entités existantes.

Nouvelle entité: "${entity_name}"
${reference_text ? `Contexte de référence (extrait): ${reference_text.substring(0, 500)}` : ''}

Entités existantes:
${existingNames.map(e => `- [${e.id}] ${e.name} (${e.entity_type}, chapitre: ${e.chapter || '?'}, brief: ${e.has_brief ? 'oui' : 'non'})`).join('\n')}

Identifie les entités existantes qui:
1. Couvrent le MÊME sujet (duplicata)
2. Ont un chevauchement significatif (la nouvelle info pourrait enrichir le brief existant)

Retourne UNIQUEMENT un JSON valide:
{
  "matches": [
    {
      "entity_id": "uuid",
      "entity_name": "nom",
      "relationship": "duplicate" | "overlap",
      "reason": "explication courte en français"
    }
  ]
}

Si aucune correspondance, retourne: { "matches": [] }`

    const response = await callClaude(systemPrompt, `Analyse les correspondances pour: ${entity_name}`, 1024)
    const parsed = parseClaudeJSON<{ matches: { entity_id: string; entity_name: string; relationship: string; reason: string }[] }>(response)

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Brief matching error:', error)
    return NextResponse.json({ matches: [] })
  }
}
