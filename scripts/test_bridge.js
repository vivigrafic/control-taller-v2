const BRIDGE = "https://script.google.com/macros/s/AKfycbwyqBeRS80Q2mg7CCFSt2736LQlnRcc73eXxaADOJk1PSkGcTcioYw2n__dnLBNWoc-AA/exec";

async function main() {
  const res = await fetch(`${BRIDGE}?action=listar_pendientes`);
  const data = await res.json();
  console.log("BRIDGE RESULT:", data?.length, "files");
  if (data && data.length > 0) {
    const pijamas = data.filter(d => (d.name || d.nombre || "").toLowerCase().includes("pijama"));
    console.log("PIJAMAS in bridge:", pijamas);
    console.log("Sample 3 files from bridge:", data.slice(0, 3));
  }
}
main().catch(console.error);
