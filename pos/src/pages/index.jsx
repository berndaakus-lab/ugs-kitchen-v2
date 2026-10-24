import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { api, homeFor } from '@/lib/client'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    api('auth/me')
      .then(({ user }) => router.replace(homeFor(user.role)))
      .catch(() => router.replace('/login'))
  }, [router])
  return <div className="p-8 text-center text-gray-400">Loading…</div>
}
