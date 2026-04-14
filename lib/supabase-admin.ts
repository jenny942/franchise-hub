import { createClient } from '@supabase/supabase-js'

// Admin client — only used server-side for syncing data
// Never expose the service role key to the browser
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
