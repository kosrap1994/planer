import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://irdwbsorxfamlnpnyesr.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHdic29yeGZhbWxucG55ZXNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODI0NzAsImV4cCI6MjA4ODY1ODQ3MH0.eUMaon6CVhj1FR98FhQ2hTrH_i8HzLslS-dU3tx0fAQ'

export const supabase = createClient(supabaseUrl, supabaseKey)
