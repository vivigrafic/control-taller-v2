const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrdnp6aGVjY25pY2xmd3F6aXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM5Mzc3NiwiZXhwIjoyMTAxOTY5Nzc2fQ.c0BOc9aO3drO5Ta8gNdURJFM5eByD2G_hu3WfOQWCZE";

async function main() {
  const resCal = await fetch(`${SUPABASE_URL}/rest/v1/prod_cola_calandrado?select=id,batch_id,id_rollo_papel,cliente_archivo,tela_destino,metros,estado&order=fecha_hora.desc&limit=15`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const cal = await resCal.json();
  console.log('--- CALANDRADO ---');
  console.log(JSON.stringify(cal, null, 2));

  const resImp = await fetch(`${SUPABASE_URL}/rest/v1/prod_impresiones?select=id,batch_id,id_rollo_papel,cliente_archivo,tela_destino,metros_impresos&order=fecha_hora.desc&limit=10`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const imp = await resImp.json();
  console.log('--- IMPRESIONES ---');
  console.log(JSON.stringify(imp, null, 2));
}

main().catch(console.error);
