const fs = require('fs');
const path = require('path');

const logoJsPath = path.join(__dirname, '..', 'src', 'assets', 'logo.js');
const content = fs.readFileSync(logoJsPath, 'utf8');
const match = content.match(/base64,([^"]+)/);

if (match && match[1]) {
  const buf = Buffer.from(match[1], 'base64');
  const iconsDir = path.join(__dirname, '..', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), buf);
  fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), buf);
  fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), buf);
  fs.writeFileSync(path.join(iconsDir, 'favicon.png'), buf);
  console.log('✅ Iconos PWA creados con éxito en /icons. Tamaño:', buf.length, 'bytes.');
} else {
  console.error('❌ No se encontró base64 en logo.js');
}
