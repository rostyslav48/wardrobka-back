// Regenerates shirt.png / leaf.png, the QA-43 fixtures used by the live
// image-analysis e2e test (ai-assistant.e2e.ts). Hand-encodes a tiny PNG with
// no dependencies (no network/image-lib access from this lane's sandbox) — a
// blue t-shirt silhouette and a green leaf silhouette, both simple enough
// that Gemini's vision output is not the thing under test here, only whether
// the API reports is_clothing correctly for an obviously-not-clothing photo.
// Run: node test/e2e/fixtures/generate-fixtures.js
const fs = require('fs');
const zlib = require('zlib');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbPixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = chunk('IHDR', ihdrData);

  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = rgbPixels(x, y);
      const off = rowStart + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const W = 300, H = 300;

// --- shirt.png: a plain blue t-shirt silhouette on a light-grey background
function shirtPixel(x, y) {
  const bg = [230, 230, 230];
  const shirt = [40, 90, 190];

  const cx = W / 2;
  // torso
  const torso = x > cx - 60 && x < cx + 60 && y > 90 && y < 260;
  // collar notch (v-neck)
  const dxc = x - cx;
  const collar = y < 120 && Math.abs(dxc) < (120 - y) * 0.6;
  // left sleeve (trapezoid-ish)
  const leftSleeve = x > cx - 110 && x < cx - 55 && y > 90 && y < 170 && (x > cx - 110 + (y - 90) * 0.3);
  // right sleeve
  const rightSleeve = x < cx + 110 && x > cx + 55 && y > 90 && y < 170 && (x < cx + 110 - (y - 90) * 0.3);

  const isShirt = (torso || leftSleeve || rightSleeve) && !collar;
  return isShirt ? shirt : bg;
}

// --- leaf.png: a green leaf shape (ellipse) with a vein and a brown stem, on white
function leafPixel(x, y) {
  const bg = [255, 255, 255];
  const leafColor = [40, 130, 50];
  const veinColor = [20, 90, 30];
  const stemColor = [90, 60, 30];

  const cx = W / 2;
  const cy = H / 2 - 10;
  // rotate coordinates by -35deg to make the leaf diagonal
  const angle = (-35 * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
  const ry = dx * Math.sin(angle) + dy * Math.cos(angle);

  // leaf blade: elongated ellipse, pointed ends (approximate with power shaping)
  const a = 100; // half-length
  const b = 45; // half-width
  const norm = (rx * rx) / (a * a) + (ry * ry) / (b * b);
  const inBlade = norm <= 1;

  // central vein
  const nearVein = Math.abs(ry) < 3 && Math.abs(rx) < a;

  // stem extends from the pointed bottom-right tip
  const stemStart = a - 5;
  const stemEnd = a + 40;
  const nearStem =
    Math.abs(ry) < 4 && rx > stemStart && rx < stemEnd;

  if (nearStem) return stemColor;
  if (inBlade) return nearVein ? veinColor : leafColor;
  return bg;
}

fs.writeFileSync(__dirname + '/shirt.png', encodePng(W, H, shirtPixel));
fs.writeFileSync(__dirname + '/leaf.png', encodePng(W, H, leafPixel));
console.log('wrote fixtures/shirt.png and fixtures/leaf.png');
