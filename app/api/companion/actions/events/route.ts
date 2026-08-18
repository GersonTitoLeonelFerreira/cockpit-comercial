import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import {
  createActionEventsRouteHandlers,
  getActionEventsCorsHeaders,
} from '@/app/lib/companion/action-events-route-handler'
import { verifyCompanionRequestToken } from '@/app/lib/server/companion-token'

function getServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const handlers = createActionEventsRouteHandlers({
  verifyRequestToken: verifyCompanionRequestToken,
  getAdminClient: getServiceRoleClient,
})

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: getActionEventsCorsHeaders(request),
  })
}

export const POST = handlers.POST
export const GET = handlers.GET
