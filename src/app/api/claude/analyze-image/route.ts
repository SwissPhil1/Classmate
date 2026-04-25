import { NextRequest, NextResponse } from 'next/server'
import { callClaudeWithVision, parseClaudeJSON } from '@/lib/claude'
import { createClient } from '@/lib/supabase/server'
import type { ImageAIBrief } from '@/lib/types'

export const maxDuration = 30 // seconds — image fetch + Claude vision

const SYSTEM_PROMPT = `Tu es un radiologue FMH expert qui analyse rapidement des images radiologiques pour aider un candidat à l'examen oral suisse.

Pour l'image fournie, génère un brief STRUCTURÉ en JSON STRICT avec exactement ces clés:
{
  "diagnostic_likely": "diagnostic le plus probable, 1 ligne, en français",
  "top_3_ddx": [
    {"dx": "nom DDx", "distinguishing_feature": "1 critère imageant qui le distingue du Dx principal"},
    ...
  ],
  "semiologic_findings": [
    "3-5 bullets COURTES (max 12 mots) — ce que TU vois sur l'image et qu'il faut nommer à l'oral, dans l'ordre de priorité",
    ...
  ],
  "modality_inferred": "CT|IRM|RX|US|UIV|angio|autre",
  "pitfalls": [
    "1-3 pièges classiques à éviter pour cette présentation",
    ...
  ]
}

RÈGLES STRICTES:
- Tout en français, niveau FMH2 suisse.
- top_3_ddx contient EXACTEMENT 3 entrées par ordre de probabilité décroissante.
- semiologic_findings: tournures télégraphiques d'oral ("masse rénale G hétérogène", "calcifications centrales", "rehaussement périphérique en cocarde"). PAS de phrases complètes.
- Si l'image est ininterprétable (qualité, mauvaise modalité), renvoie quand même le JSON avec diagnostic_likely="image non interprétable" et explique brièvement dans pitfalls.
- Réponds UNIQUEMENT avec le JSON, sans markdown, sans préambule, sans explication.`

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { image_id } = await request.json()
    if (!image_id || typeof image_id !== 'string') {
      return NextResponse.json({ error: 'image_id requis' }, { status: 400 })
    }

    // RLS already filters by user_id — extra check below for the entity name
    // hint we add to the prompt.
    const { data: image, error: fetchError } = await supabase
      .from('entity_images')
      .select('id, storage_path, entity_id, entities!inner(name, chapter_id, chapters!inner(name, topics!inner(name)))')
      .eq('id', image_id)
      .single()

    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image introuvable' }, { status: 404 })
    }

    // Mark as analyzing — useful if the user reloads while the call is in flight.
    await supabase
      .from('entity_images')
      .update({ ai_brief_status: 'analyzing', ai_brief_error: null })
      .eq('id', image_id)

    // Get a signed URL for Claude to download the image.
    const { data: signed, error: signedError } = await supabase.storage
      .from('entity-images')
      .createSignedUrl(image.storage_path, 300)
    if (signedError || !signed) {
      throw new Error('Impossible de générer une URL signée pour l\'image')
    }

    // Build a context line for the prompt — entity name + chapter + topic give
    // Claude enough taxonomy to anchor the DDx.
    type Joined = {
      entities: { name: string; chapters: { name: string; topics: { name: string } } }
    }
    const joined = image as unknown as Joined
    const entityName = joined.entities?.name ?? 'inconnue'
    const chapterName = joined.entities?.chapters?.name ?? 'inconnu'
    const topicName = joined.entities?.chapters?.topics?.name ?? 'inconnu'

    const userMessage = `Contexte: cette image est attachée à l'entité "${entityName}" (chapitre: ${chapterName}, thème: ${topicName}). Génère le brief JSON pour cette image.`

    let response: string
    try {
      response = await callClaudeWithVision(SYSTEM_PROMPT, userMessage, [signed.signedUrl], 1024)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await supabase
        .from('entity_images')
        .update({ ai_brief_status: 'error', ai_brief_error: message })
        .eq('id', image_id)
      return NextResponse.json({ error: `Analyse Claude impossible: ${message}` }, { status: 502 })
    }

    let parsed: ImageAIBrief
    try {
      parsed = parseClaudeJSON<ImageAIBrief>(response)
    } catch (err) {
      const message = `JSON invalide: ${err instanceof Error ? err.message : String(err)}`
      await supabase
        .from('entity_images')
        .update({ ai_brief_status: 'error', ai_brief_error: message })
        .eq('id', image_id)
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const generatedAt = new Date().toISOString()
    // Don't auto-overwrite the user's modality choice — the inferred value is
    // available inside ai_brief.modality_inferred for the edit modal to suggest.
    const { error: updateError } = await supabase
      .from('entity_images')
      .update({
        ai_brief: parsed,
        ai_brief_status: 'done',
        ai_brief_error: null,
        ai_brief_generated_at: generatedAt,
      })
      .eq('id', image_id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({
      ai_brief: parsed,
      ai_brief_status: 'done',
      ai_brief_generated_at: generatedAt,
    })
  } catch (error) {
    console.error('Analyze image error:', error)
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
