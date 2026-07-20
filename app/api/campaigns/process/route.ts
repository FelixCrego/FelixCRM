import { NextResponse } from 'next/server';
import { countCampaignSendsToday, getDueEnrollments, markFailed, markSent } from '@/lib/campaign-store';
import { sendGmail } from '@/lib/gmail-delivery';
import { createLeadNote } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 60;
function authorized(request:Request){ const secret=process.env.CRON_SECRET; const auth=request.headers.get('authorization'); return Boolean(secret && auth===`Bearer ${secret}`); }
function merge(template:string,row:any){ return template.replace(/\{\{\s*(first_name|business_name|email)\s*\}\}/gi,(_,key)=> key.toLowerCase()==='email'?row.email:'there'); }
export async function GET(request:Request){
  if (!authorized(request)) return NextResponse.json({error:'Unauthorized'},{status:401});
  const rows=await getDueEnrollments(40); const sent=[]; const skipped=[];
  for(const row of rows){
    const count=await countCampaignSendsToday(row.campaign_id);
    if(count>=row.daily_limit){ skipped.push({id:row.id,reason:'daily_limit'}); continue; }
    const unsubscribe=`${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://felix-crm-felix-8043s-projects.vercel.app'}/api/public/unsubscribe?token=${encodeURIComponent(row.unsubscribe_token)}`;
    const body=`${merge(row.body,row)}\n\n— Felix Crego\nFelixCrego.com\n12335 N Putney Ct, Leesburg, FL 34788\n\nTo stop receiving these emails, unsubscribe: ${unsubscribe}`;
    try{
      const result=await sendGmail({to:row.email,subject:merge(row.subject,row),text:body,replyTo:'felix@felixcrego.com'});
      await markSent({enrollmentId:row.id,campaignId:row.campaign_id,leadId:row.lead_id,providerMessageId:result.messageId});
      await createLeadNote(row.lead_id,`Campaign email sent\nSubject: ${merge(row.subject,row)}\nTo: ${row.email}`,'email',result.messageId);
      sent.push({id:row.id,messageId:result.messageId});
    }catch(e){ const message=e instanceof Error?e.message:'Send failed'; await markFailed(row.id,row.campaign_id,row.lead_id,message); skipped.push({id:row.id,reason:message}); }
  }
  return NextResponse.json({sent,skipped});
}
