import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
type ListRow = { id: string; name: string }

export default async function ImportarPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined

  // Se vier do Pipeline com ?list=..., já pré-seleciona a carteira no client
  const listParam = searchParams?.list
  const defaultListId =
    typeof listParam === 'string'
      ? listParam
      : Array.isArray(listParam)
      ? listParam[0]
      : null

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookies()
          return store.getAll()
        },
        async setAll() {},
      },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) redirect('/login')

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile?.company_id) redirect('/leads')

  const companyId = String(profile.company_id)

  const { data: listsData, error: listsErr } = await supabase
    .from('lead_lists')
    .select('id, name')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  const lists: ListRow[] = (listsData ?? []).map((l: any) => ({
    id: String(l.id),
    name: String(l.name),
  }))

  return (
    <div style={{ width: 980, margin: '60px auto', color: 'white' }}>
      <a href="/leads" style={{ color: '#9aa', textDecoration: 'none' }}>
        ← Voltar
      </a>

      <h1 style={{ marginTop: 16, marginBottom: 6 }}>Importar Leads (Excel)</h1>
      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 14 }}>
        Escolha a carteira/lista, envie o .xlsx e o sistema cria/atualiza leads e vincula na carteira.
      </div>

      {listsErr ? (
        <div
          style={{
            padding: 12,
            border: '1px solid #333',
            borderRadius: 12,
            background: '#0f0f0f',
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          Erro ao carregar listas/carteiras: {listsErr.message}
        </div>
      ) : null}

    </div>
  )
}
