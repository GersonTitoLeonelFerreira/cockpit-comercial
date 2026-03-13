'use client'

import { createBrowserClient } from '@supabase/ssr'

let supabaseClient: any = null

export function supabaseBrowser() {
  if (supabaseClient) {
    return supabaseClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  supabaseClient = createBrowserClient(url, anonKey)
  return supabaseClient
}