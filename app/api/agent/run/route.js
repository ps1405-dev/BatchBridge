import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

function distanceKm(a,b,c,d){const r=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p;const q=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return Math.round(r*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q))*10)/10}

export async function POST(request) {
  try {
    const token=request.headers.get('authorization')?.replace('Bearer ','');
    const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data:{user}}=await admin.auth.getUser(token); if(!user)return Response.json({error:'Sign in required'},{status:401});
    const {makerId,productId}=await request.json();
    const [{data:maker},{data:product},{data:leads}]=await Promise.all([admin.from('makers').select('*').eq('id',makerId).eq('user_id',user.id).single(),admin.from('products').select('*').eq('id',productId).eq('maker_id',makerId).single(),admin.from('leads').select('*').eq('maker_id',makerId).eq('product_id',productId).eq('user_id',user.id)]);
    if(!maker)return Response.json({error:'Maker not found'},{status:404}); if(!product)return Response.json({error:'Choose a valid product before ranking.'},{status:400}); if(!leads?.length)return Response.json({error:'Find real nearby businesses for this product first.'},{status:400});
    const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const businesses=leads.map(x=>({id:x.id,name:x.business_name,source:x.source,distance_km:maker.latitude&&x.latitude?distanceKm(Number(maker.latitude),Number(maker.longitude),Number(x.latitude),Number(x.longitude)):null}));
    const prompt=`You are a wholesale-sales assistant. Rank ONLY these real businesses for this maker and this one product. Never invent businesses, Google ratings, Google reviews, demand, contact information, or facts beyond the supplied data. Use the supplied distance as a ranking signal and mention distance when available. Make every outreach_draft specific to the product, business name and distance; do not reuse generic wording. Maker: ${JSON.stringify({name:maker.name,category:maker.category,address:maker.address})}. Product: ${JSON.stringify(product)}. Businesses: ${JSON.stringify(businesses)}. Return JSON only: [{id,score:integer 0-100,rationale,offer,outreach_draft}].`;
    const response=await ai.models.generateContent({model:'gemini-3.6-flash',contents:prompt,config:{responseMimeType:'application/json'}}); const ranked=JSON.parse(response.text);
    for(const x of ranked){if(!leads.some(l=>l.id===x.id))continue;const score=Math.max(0,Math.min(100,Math.round(Number(x.score)||0)));await admin.from('leads').update({score,rationale:String(x.rationale||''),offer:String(x.offer||''),outreach_draft:String(x.outreach_draft||'')}).eq('id',x.id).eq('user_id',user.id)}
    await admin.from('agent_runs').insert({maker_id:makerId,user_id:user.id,action:'rank_real_openstreetmap_leads',input_summary:`${product.name}; ${leads.length} sourced businesses`,output_summary:`${ranked.length} leads ranked by Gemini`});
    return Response.json({ranked:ranked.length});
  }catch(error){return Response.json({error:error.message||'Agent failed'},{status:500})}
}
