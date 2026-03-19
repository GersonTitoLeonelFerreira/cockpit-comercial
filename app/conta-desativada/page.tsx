'use client'

import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

export default function ContaDesativadaPage() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = supabaseBrowser()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleRetry() {
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-white">Conta desativada</h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Sua conta foi desativada pelo administrador. Entre em contato com o
            administrador da sua empresa para reativar seu acesso.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={handleRetry}
            className="px-5 py-2.5 rounded-lg border border-white/20 text-white text-sm hover:bg-white/5 transition-colors"
          >
            Tentar novamente
          </button>
          <button
            onClick={handleSignOut}
            className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  )
}
