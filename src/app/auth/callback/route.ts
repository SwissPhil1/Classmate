import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'magiclink' | 'email' | null
  const next = searchParams.get('next') ?? '/dashboard'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  let authError = null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    authError = error
  } else {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  if (authError) {
    console.error('Auth callback error:', authError.message)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(authError.message)}`)
  }

  // Initialize user settings if first login
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('user_id')
        .eq('user_id', user.id)
        .single()

      if (!settings) {
        await supabase.from('user_settings').insert({
          user_id: user.id,
          exam_date_written: '2026-08-26',
          exam_date_oral_start: '2026-08-27',
          exam_date_oral_end: '2026-08-28',
          week_start_date: new Date().toISOString().split('T')[0],
        })
      }
    }
  } catch (err) {
    console.error('Settings init error:', err)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
