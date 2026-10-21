async function test() {
  const id = "1ok_g3Z9MhjXDnKiEcCw1fNoEtG2G7A8o";
  const url1 = `https://drive.google.com/thumbnail?id=${id}&sz=w100-h100`;
  const url2 = `https://lh3.googleusercontent.com/d/${id}=s200`;
  const r1 = await fetch(url1);
  console.log("url1 status:", r1.status, r1.headers.get("content-type"));
  const r2 = await fetch(url2);
  console.log("url2 status:", r2.status, r2.headers.get("content-type"));
}
test().catch(console.error);
