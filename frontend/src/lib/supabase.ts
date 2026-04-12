import { createClient } from "@supabase/supabase-js";

// Fallback placeholders prevent build-time crash when env vars aren't set.
// At runtime on Vercel these will always be the real values.
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  || "https://placeholder.supabase.co";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(url, anon);
