import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { activateCampaign, createCampaign, listCampaigns } from '@/lib/campaign-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({error:'Unauthorized'},{status:401});
  return NextResponse.json({campaigns: await listCampaigns(user.id)});
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({error:'Unauthorized'},{status:401});
  const body = await request.json().catch(()=>({}));
  if (body.action === 'activate' && body.campaignId) {
    const campaign = await activateCampaign(user.id, String(body.campaignId));
    return campaign ? NextResponse.json({campaign}) : NextResponse.json({error:'Campaign not found'},{status:404});
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const steps = Array.isArray(body.steps) ? body.steps.filter((s:any)=>s && String(s.subject||'').trim() && String(s.body||'').trim()).map((s:any)=>({delayDays:Number(s.delayDays)||0,subject:String(s.subject).trim(),body:String(s.body).trim()})) : [];
  if (!name || !steps.length) return NextResponse.json({error:'Name and at least one complete step are required.'},{status:400});
  const campaign = await createCampaign(user.id,{name,dailyLimit:Number(body.dailyLimit)||25,steps});
  return NextResponse.json({campaign},{status:201});
}
