import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * Call at the top of any protected page.
 * - Redirects to /login if not authenticated
 * - Redirects franchisees to /onboarding if profile_complete is false
 * - Redirects corporate users to /dashboard (skips onboarding)
 * - Calls onReady(userId, role) once access is confirmed
 */
export function useAuthGuard(onReady: (userId: string, role: string) => void) {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }

      const uid = session.user.id
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, profile_complete')
        .eq('id', uid)
        .single()

      const role = profile?.role ?? 'franchisee'

      // Corporate users never need onboarding
      if (role !== 'corporate' && !profile?.profile_complete) {
        router.push('/onboarding')
        return
      }

      onReady(uid, role)
    })
  }, [])
}
