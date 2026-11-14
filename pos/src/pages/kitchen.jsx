import { useEffect } from 'react'
import { useRouter } from 'next/router'

// The Module 2 kitchen screen grew into /store (warehouse and kitchens).
export default function Kitchen() {
  const router = useRouter()
  useEffect(() => { router.replace('/store') }, [router])
  return <div className="p-8 text-center text-gray-400">Loading…</div>
}
