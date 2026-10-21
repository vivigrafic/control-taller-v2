const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrdnp6aGVjY25pY2xmd3F6aXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM5Mzc3NiwiZXhwIjoyMTAxOTY5Nzc2fQ.c0BOc9aO3drO5Ta8gNdURJFM5eByD2G_hu3WfOQWCZE";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prod_cola_calandrado?batch_id=eq.BATCH-31g-1610-1-1792447399000&select=id,batch_id,cliente_archivo,diseno,file_id,metros`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  console.log("CALANDRADO:", JSON.stringify(await res.json(), null, 2));

  const resImp = await fetch(`${SUPABASE_URL}/rest/v1/prod_impresiones?batch_id=eq.BATCH-31g-1610-1-1792447399000&select=id,batch_id,cliente_archivo,diseno,file_id,metros_impresos`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  console.log("IMPRESIONES:", JSON.stringify(await resImp.json(), null, 2));

  const resDrive = await fetch(`${SUPABASE_URL}/rest/v1/prod_pendientes_drive?limit=10&select=id,nombre_archivo,file_id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  console.log("DRIVE SAMPLE:", JSON.stringify(await resDrive.json(), null, 2));
}
main().catch(console.error);
