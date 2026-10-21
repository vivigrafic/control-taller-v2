const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtrdnp6aGVjY25pY2xmd3F6aXZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjM5Mzc3NiwiZXhwIjoyMTAxOTY5Nzc2fQ.c0BOc9aO3drO5Ta8gNdURJFM5eByD2G_hu3WfOQWCZE";

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prod_pendientes_drive?nombre_archivo=ilike.*VIVI*&select=id,nombre_archivo,file_id,estado_impreso`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const data = await res.json();
  console.log("VIVI IN DRIVE:", JSON.stringify(data, null, 2));

  const count = await fetch(`${SUPABASE_URL}/rest/v1/prod_pendientes_drive?select=count`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: "count=exact" }
  });
  console.log("COUNT:", count.headers.get("content-range"));
}
main().catch(console.error);
