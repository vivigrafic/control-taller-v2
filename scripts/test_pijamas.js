const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrdnp6aGVjY25pY2xmd3F6aXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM5Mzc3NiwiZXhwIjoyMTAxOTY5Nzc2fQ.c0BOc9aO3drO5Ta8gNdURJFM5eByD2G_hu3WfOQWCZE";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prod_pendientes_drive?nombre_archivo=ilike.*PIJAMAS*&select=id,nombre_archivo,file_id,estado_impreso`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const data = await res.json();
  console.log("PIJAMAS IN DRIVE:", JSON.stringify(data, null, 2));

  // Also check if there are other files in drive to see what valid file_ids look like
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/prod_pendientes_drive?limit=5&select=id,nombre_archivo,file_id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const data2 = await res2.json();
  console.log("OTHER DRIVE FILES:", JSON.stringify(data2, null, 2));

  for (const d of data2) {
    if (d.file_id) {
      const r = await fetch(`https://drive.google.com/thumbnail?id=${d.file_id}&sz=w100-h100`);
      console.log(`Thumbnail for ${d.file_id} (${d.nombre_archivo}): status = ${r.status}`);
    }
  }
}
main().catch(console.error);
