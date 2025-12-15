import { NextResponse } from 'next/server';
import { supabaseBrowser } from '@/lib/supabase/browser';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get('city');

  const supabase = supabaseBrowser();

  let q = supabase
    .from('tours')
    .select('id, slug, title, city, tags, base_price, duration_hours, images, summary')
    .order('created_at', { ascending: false });

  if (city) q = q.eq('city', city);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
