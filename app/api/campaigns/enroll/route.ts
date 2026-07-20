import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { canUserViewAllLeads, getLeadById } from '@/lib/store';
import { enrollLead } from '@/lib/campaign-store';

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({error:'Unauthorized'},{status:401});
  const body = await request.json().catch(()=>({}));
  const campaignId = String(body.campaignId||'');
  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(String) : [String(body.leadId||'')].filter(Boolean);
  const includeAll = await canUserViewAllLeads(user.id,user.email);
  const results=[];
  for (const leadId of leadIds.slice(0,100)) {
    const lead = await getLeadById(leadId,user.id,{includeAll});
    if (!lead?.email) { results.push({leadId,ok:false,error:'Missing email'}); continue; }
    try { await enrollLead({ownerId:user.id,campaignId,leadId,email:lead.email}); results.push({leadId,ok:true}); }
    catch(e){ results.push({leadId,ok:false,error:e instanceof Error?e.message:'Unable to enroll'}); }
  }
  return NextResponse.json({results});
}
