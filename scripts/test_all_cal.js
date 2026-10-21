const SUPABASE_URL = "https://kkvzzheccniclfwqzivu.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || '' // clave secreta: va en el archivo .env (no se sube), nunca en el código;

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/prod_cola_calandrado?select=id,batch_id,cliente_archivo,file_id,estado&limit=20`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const data = await res.json();
  for (const r of data) {
    console.log(`[${r.batch_id}] ${r.cliente_archivo} -> file_id: "${r.file_id}"`);
    if (r.file_id) {
      const firstId = r.file_id.split(",")[0].trim();
      const resp = await fetch(`https://drive.google.com/thumbnail?id=${firstId}&sz=w100-h100`);
      console.log(`   thumb status: ${resp.status}`);
    }
  }
}
main().catch(console.error);
