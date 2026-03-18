import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import type { CycleEvent, SalesCycle } from '@/app/types/sales_cycles'
import SalesCycleDetailClient from './SalesCycleDetailClient'

async function getSalesCycleDetail(cycleId: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect('/login')

  // Get cycle with lead data
  const { data: cycleData, error: cycleErr } = await supabase
    .from('sales_cycles')
    .select(`
      *,
      leads:lead_id (id, name, phone, email)
    `)
    .eq('id', cycleId)
    .single()

  if (cycleErr || !cycleData) {
    redirect('/leads')
  }

  // Get events
  const { data: eventsData } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('occurred_at', { ascending: false })

  return {
    cycle: cycleData as any,
    events: (eventsData || []) as CycleEvent[],
  }
}

export default async function SalesCycleDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { cycle, events } = await getSalesCycleDetail(params.id)

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start gap-4 flex-wrap">
        <div>
          <Link
            href="/leads"
            className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
          >
            ← Voltar ao Pipeline
          </Link>
          <h1 className="text-3xl font-bold text-white">{cycle.leads?.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Ciclo #{cycle.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Cycle details + Events */}
        <div className="lg:col-span-2">
          {/* Cycle info card */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Informações</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 uppercase">Lead</label>
                <p className="text-white font-semibold">{cycle.leads?.name}</p>
              </div>

              {cycle.leads?.phone && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">Telefone</label>
                  <p className="text-white">{cycle.leads.phone}</p>
                </div>
              )}

              {cycle.leads?.email && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">Email</label>
                  <p className="text-white">{cycle.leads.email}</p>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 uppercase">Status</label>
                <p className="text-white font-semibold capitalize">{cycle.status}</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase">
                  No status há
                </label>
                <p className="text-white">
                  {Math.floor(
                    (Date.now() -
                      new Date(cycle.stage_entered_at).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )}{' '}
                  dia(s)
                </p>
              </div>

              {cycle.next_action && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">
                    Próxima Ação
                  </label>
                  <p className="text-white">{cycle.next_action}</p>
                  {cycle.next_action_date && (
                    <p className="text-gray-400 text-sm mt-1">
                      {new Date(cycle.next_action_date).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {cycle.closed_at && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">
                    Fechado em
                  </label>
                  <p className="text-white">
                    {new Date(cycle.closed_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timeline: Events */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Histórico</h2>

            {events.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum evento registrado
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((event, index) => (
                  <div
                    key={event.id}
                    className="flex gap-4 pb-4 border-b border-gray-700 last:border-b-0"
                  >
                    {/* Timeline dot */}
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-blue-500 rounded-full mt-1" />
                      {index < events.length - 1 && (
                        <div className="w-0.5 h-12 bg-gray-700 mt-2" />
                      )}
                    </div>

                    {/* Event details */}
                    <div className="flex-1 pt-0.5">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-semibold text-white capitalize">
                            {event.event_type.replace(/_/g, ' ')}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(event.occurred_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      {Object.keys(event.metadata).length > 0 && (
                        <div className="mt-2 text-xs text-gray-400 bg-gray-800 p-2 rounded">
                          {JSON.stringify(event.metadata, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Actions */}
        <div>
          <SalesCycleDetailClient cycle={cycle} />
        </div>
      </div>
    </div>
  )
}