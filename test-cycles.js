const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function test() {
  const { data, error } = await supabase.rpc('rpc_get_user_sales_cycles', {
    p_owner_user_id: null,
    p_status: null,
    p_limit: 100,
    p_offset: 0,
  })
  
  console.log('Data:', data)
  console.log('Error:', error)
}

test()
