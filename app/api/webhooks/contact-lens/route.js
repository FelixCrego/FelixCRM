import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase Admin Client to bypass RLS for backend inserts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // 1. Parse the incoming AWS payload
    const payload = await request.json();

    // 2. Extract the intelligence data
    // Note: We expect the AWS EventBridge/Lambda to format the payload to match these keys
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

    // 3. Validate critical fields
    if (!lead_id || !contact_id) {
      return NextResponse.json(
        { error: 'Missing required routing fields: lead_id or contact_id' }, 
        { status: 400 }
      );
    }

    // 4. Insert into the database
    const { error } = await supabaseAdmin
      .from('call_analytics')
      .insert([{
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
      }]);

    if (error) {
      console.error('Supabase Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 5. Return success
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
