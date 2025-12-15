import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    return NextResponse.json(
      {
        ok: false,
        missing: {
          SUPABASE_URL: !process.env.SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_URL: !process.env.NEXT_PUBLIC_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
      },
      { status: 500 },
    );
  }

  const supabase = createClient(url, anon);

  const { data, error } = await supabase.from('tours').select('id, slug, title').limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, supabaseError: { message: error.message, code: error.code } },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sample: data ?? [] });
}
