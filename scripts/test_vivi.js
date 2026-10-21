const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || '' // clave secreta: va en el archivo .env (no se sube), nunca en el código;

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
