import { createBrowserClient } from '@supabase/ssr'

let client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.')
    if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY 환경변수가 설정되지 않았습니다. .env.local을 확인하세요.')
    client = createBrowserClient(url, anonKey)
  }
  return client
}
