import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type CallAnalyticsRecord = {
  lead_id: string;
  contact_id: string;
  duration_seconds?: number;
  overall_sentiment?: string;
  recording_url?: string;
  ai_summary?: string;
  agent_talk_time_pct?: number;
  customer_talk_time_pct?: number;
  interruptions?: number;
  transcript_json?: unknown;
};

async function insertCallAnalytics(
  baseUrl: string,
  serviceRoleKey: string,
  record: CallAnalyticsRecord
) {
  const url = new URL('/rest/v1/call_analytics', baseUrl);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify([record])
  });

  if (!response.ok) {
    const message = await response.text();
    return { error: { message: message || 'Failed to insert call analytics row' } };
  }

  return { error: null };
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    const {
      lead_id,
      contact_id,
      duration_seconds,
      overall_sentiment,
      recording_url,
      ai_summary,
      agent_talk_time_pct,
      customer_talk_time_pct,
      interruptions,
      transcript_json
    } = payload;

    if (!lead_id || !contact_id) {
      return NextResponse.json(
        { error: 'Missing required routing fields: lead_id or contact_id' },
        { status: 400 }
      );
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'Missing Supabase configuration for service-role webhook ingestion' },
        { status: 500 }
      );
    }

    const { error } = await insertCallAnalytics(supabaseUrl, supabaseServiceRoleKey, {
      lead_id,
      contact_id,
      duration_seconds,
      overall_sentiment,
      recording_url,
      ai_summary,
      agent_talk_time_pct,
      customer_talk_time_pct,
      interruptions,
      transcript_json
    });

    if (error) {
      console.error('Supabase Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, message: 'AWS Contact Lens data secured.' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Internal Server Error processing Webhook' },
      { status: 500 }
    );
  }
}
