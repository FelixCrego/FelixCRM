import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAuthenticatedUser } from '@/lib/auth';
import { canUserViewAllLeads, getLeadById } from '@/lib/store';

export async function POST(request:Request){
  const user=await getAuthenticatedUser(); if(!user?.id) return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await request.json().catch(()=>({})); const leadId=String(body.leadId||'');
  const includeAll=await canUserViewAllLeads(user.id,user.email); const lead=await getLeadById(leadId,user.id,{includeAll});
  if(!lead) return NextResponse.json({error:'Lead not found'},{status:404});
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const prompt=`Write a carefully researched B2B cold email for Felix Crego. Use ONLY the supplied facts. Never invent achievements, problems, employee names, technologies, or website observations. If research is thin, acknowledge the business category without fake personalization. Keep under 120 words, one clear business outcome, one low-friction CTA, plain text. Return JSON with subject, body, factsUsed, confidence.\nLEAD FACTS:\n${JSON.stringify({businessName:lead.businessName,email:lead.email,websiteUrl:lead.websiteUrl,city:lead.city,businessType:lead.businessType,websiteStatus:lead.websiteStatus,aiResearchSummary:lead.aiResearchSummary,googleRating:lead.googleRating,googleReviews:lead.googleReviews},null,2)}`;
  const response=await client.chat.completions.create({model:'gpt-4o-mini',temperature:0.3,response_format:{type:'json_object'},messages:[{role:'system',content:'You are a compliance-conscious B2B outbound copywriter. Ground every personalization claim in supplied data.'},{role:'user',content:prompt}]});
  return NextResponse.json(JSON.parse(response.choices[0]?.message?.content||'{}'));
}
