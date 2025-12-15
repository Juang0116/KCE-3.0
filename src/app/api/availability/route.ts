import { NextResponse } from 'next/server';
import { supabaseBrowser } from '@/lib/supabase/browser';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tourId = searchParams.get('tour_id');

  if (!tourId) {
    return NextResponse.json({ ok: false, error: 'Missing tour_id' }, { status: 400 });
  }

  const supabase = supabaseBrowser();

  const { data, error } = await supabase
    .from('tour_availability')
    .select('date, capacity, price')
    .eq('tour_id', tourId)
    .gte('date', new Date().toISOString().slice(0, 10))
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ ok: false, error }, { status: 500 });

  return NextResponse.json({ ok: true, data });
}
