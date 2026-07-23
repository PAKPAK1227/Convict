import { createClient } from '@supabase/supabase-js';

// Fall back to harmless placeholders when the env vars are absent (e.g. under
// Jest) so importing this module never throws. In every real build the
// REACT_APP_* values are present and take precedence.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://localhost:54321';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
