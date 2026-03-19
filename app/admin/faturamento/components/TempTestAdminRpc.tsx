'use client'

import { useEffect } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

export function TempTestAdminRpc() {
  useEffect(() => {
    async function run() {
      const supabase = supabaseBrowser()
      const { data, error } = await supabase.rpc('rpc_admin_list_sellers_stats', { p_days: 30 })
      console.log('rpc_admin_list_sellers_stats', { data, error })
      alert(error ? `RPC erro: ${error.message}` : `RPC ok: ${data?.length ?? 0} sellers`)
    }
    void run()
  }, [])

  return null
}