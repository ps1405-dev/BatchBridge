import { createClient } from '@supabase/supabase-js';

async function nearbyBusinesses(query) {
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
  const request=async endpoint=>{
    try {
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'BatchBridge hackathon pilot'},body:`data=${encodeURIComponent(query)}`,signal:AbortSignal.timeout(9000)});
      const text=await response.text();
      if (!response.ok || !text.trim().startsWith('{')) throw new Error('Invalid map response');
      const parsed=JSON.parse(text);
      if (Array.isArray(parsed.elements)) return parsed.elements;
      throw new Error('No map data');
    } catch(error){throw error}
  };
  try{return await Promise.any(endpoints.map(request))}catch{throw new Error('Nearby-business search timed out after 9 seconds. Please retry once or use the saved-address search.');}
}

export async function POST(request) {
  try {
    const token=request.headers.get('authorization')?.replace('Bearer ','');
    const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data:{user}}=await admin.auth.getUser(token); if(!user)return Response.json({error:'Sign in required'},{status:401});
    const {makerId,productId,latitude,longitude}=await request.json();
    const {data:maker}=await admin.from('makers').select('*').eq('id',makerId).eq('user_id',user.id).single();
    if(!maker)return Response.json({error:'Maker profile not found.'},{status:404});
    const {data:product}=await admin.from('products').select('*').eq('id',productId).eq('maker_id',makerId).single();
    if(!product)return Response.json({error:'Choose one of your products before finding buyers.'},{status:400});
    if(!maker.address&&(!latitude||!longitude))return Response.json({error:'Add an address or allow current-location access first.'},{status:400});
    let lat=latitude||maker.latitude,lon=longitude||maker.longitude;
    if(!lat||!lon){const geo=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(maker.address)}`,{headers:{'User-Agent':'BatchBridge hackathon pilot (contact: support@batchbridge.local)',Accept:'application/json'}});const places=await geo.json();if(!places[0])return Response.json({error:'Address was not found. Include city and postcode, then retry.'},{status:404});lat=Number(places[0].lat);lon=Number(places[0].lon)}
    await admin.from('makers').update({latitude:lat,longitude:lon}).eq('id',makerId);
    // A maker can sell very different products. Match buyers to the selected product,
    // never to the maker's broad business category.
    const words=`${product.name||''} ${product.description||''}`.toLowerCase();
    const soap=/soap|skincare|skin care|cosmetic|beauty/.test(words);
    const food=/cake|pastry|bakery|brownie|cookie|chocolate|food|snack/.test(words);
    const selectors=soap?'nwr["shop"~"beauty|cosmetics|gift|variety_store|department_store|convenience"]':food?'nwr["amenity"~"cafe|restaurant|fast_food"] ; nwr["shop"~"bakery|confectionery|pastry|supermarket"]':'nwr["shop"~"gift|variety_store|convenience|supermarket|department_store"]';
    const query=`[out:json][timeout:8];(${selectors.split(' ; ').map(s=>`${s}(around:3500,${lat},${lon});`).join('')});out center tags;`;
    const elements=await nearbyBusinesses(query);
    const seen=new Set();
    const rows=elements.filter(x=>x.tags?.name).map(x=>({maker_id:makerId,product_id:productId,user_id:user.id,business_name:x.tags.name,score:0,rationale:'Awaiting Gemini ranking of this source-linked OpenStreetMap result.',offer:'',outreach_draft:'',latitude:x.lat||x.center?.lat,longitude:x.lon||x.center?.lon,source:'OpenStreetMap',source_url:`https://www.openstreetmap.org/${x.type}/${x.id}`,external_id:`osm:${x.type}:${x.id}`})).filter(row=>!seen.has(row.external_id)&&seen.add(row.external_id)).slice(0,30);
    const {error:deleteError}=await admin.from('leads').delete().eq('maker_id',makerId).eq('user_id',user.id).eq('product_id',productId);
    if(deleteError)throw new Error(`Could not clear previous results: ${deleteError.message}`);
    if(rows.length){const {error:insertError}=await admin.from('leads').insert(rows);if(insertError)throw new Error(`Could not save discovered businesses: ${insertError.message}`)}
    await admin.from('agent_runs').insert({maker_id:makerId,user_id:user.id,action:'discover_nearby_openstreetmap',input_summary:`${product.name}; ${maker.address||'browser location'}`,output_summary:`${rows.length} OpenStreetMap businesses discovered`});
    return Response.json({discovered:rows.length});
  }catch(error){return Response.json({error:error.message||'Discovery failed'},{status:500})}
}
