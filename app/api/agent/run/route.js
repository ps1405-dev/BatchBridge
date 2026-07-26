import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    const token=request.headers.get('authorization')?.replace('Bearer ','');
    const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data:{user}}=await admin.auth.getUser(token); if(!user)return Response.json({error:'Sign in required'},{status:401});
    const {makerId}=await request.json();
    const [{data:maker},{data:products},{data:leads}]=await Promise.all([admin.from('makers').select('*').eq('id',makerId).eq('user_id',user.id).single(),admin.from('products').select('*').eq('maker_id',makerId),admin.from('leads').select('*').eq('maker_id',makerId).eq('user_id',user.id)]);
    if(!maker)return Response.json({error:'Maker not found'},{status:404}); if(!products?.length)return Response.json({error:'Add at least one real product before ranking buyers.'},{status:400}); if(!leads?.length)return Response.json({error:'Find real nearby businesses first.'},{status:400});
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const prompt=`You are a wholesale-sales assistant. Rank ONLY these real OpenStreetMap businesses for this maker. Never invent businesses, reviews, demand, contact information, or facts beyond the supplied data. Maker: ${JSON.stringify({name:maker.name,category:maker.category,address:maker.address})}. Products: ${JSON.stringify(products)}. Businesses: ${JSON.stringify(leads.map(x=>({id:x.id,name:x.business_name,source:x.source})))}. Return JSON only: [{id,score:integer 0-100,rationale,offer,outreach_draft}]. Clearly phrase uncertainty when information is missing.`;
    const response=await ai.models.generateContent({model:'gemini-3.6-flash',contents:prompt,config:{responseMimeType:'application/json'}}); const ranked=JSON.parse(response.text);
    for(const x of ranked){if(!leads.some(l=>l.id===x.id))continue;const score=Math.max(0,Math.min(100,Math.round(Number(x.score)||0)));await admin.from('leads').update({score,rationale:String(x.rationale||''),offer:String(x.offer||''),outreach_draft:String(x.outreach_draft||'')}).eq('id',x.id).eq('user_id',user.id)}
    await admin.from('agent_runs').insert({maker_id:makerId,user_id:user.id,action:'rank_real_openstreetmap_leads',input_summary:`${products.length} products; ${leads.length} sourced businesses`,output_summary:`${ranked.length} leads ranked by Gemini`});
    return Response.json({ranked:ranked.length});
  }catch(error){return Response.json({error:error.message||'Agent failed'},{status:500})}
}
