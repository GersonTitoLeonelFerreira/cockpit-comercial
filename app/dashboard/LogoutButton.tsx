'use client'

import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  const sair = async () => {
    await fetch('/auth/signout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <button onClick={sair}>
      Sair
    </button>
  )
}
