/**
 * create-icons.js - Generate simple PNG icons for the extension
 * Run with: node create-icons.js
 * 
 * This creates simple solid-color square icons with a house design.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table
const crcTable = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c >>> 0;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPNG(size) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData.writeUInt8(8, 8);   // bit depth
  ihdrData.writeUInt8(2, 9);   // RGB
  ihdrData.writeUInt8(0, 10);  // compression
  ihdrData.writeUInt8(0, 11);  // filter
  ihdrData.writeUInt8(0, 12);  // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // Create image data
  const rowSize = 1 + size * 3;
  const rawData = Buffer.alloc(rowSize * size);
  
  const centerX = size / 2;
  
  for (let y = 0; y < size; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // filter: none
    
    for (let x = 0; x < size; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      
      // Simple house icon design
      const roofTop = Math.floor(size * 0.15);
      const roofBottom = Math.floor(size * 0.45);
      const bodyBottom = Math.floor(size * 0.85);
      const bodyLeft = Math.floor(size * 0.2);
      const bodyRight = Math.floor(size * 0.8);
      
      // Check if in roof (triangle)
      const roofWidth = (y - roofTop) * 0.9;
      const isInRoof = y >= roofTop && y < roofBottom &&
                       Math.abs(x - centerX) < roofWidth;
      
      // Check if in body (rectangle)
      const isInBody = y >= roofBottom && y < bodyBottom &&
                       x >= bodyLeft && x < bodyRight;
      
      // Check if in door
      const doorLeft = Math.floor(size * 0.38);
      const doorRight = Math.floor(size * 0.62);
      const doorTop = Math.floor(size * 0.55);
      const isInDoor = y >= doorTop && y < bodyBottom &&
                       x >= doorLeft && x < doorRight;
      
      let r, g, b;
      if (isInRoof) {
        r = 39; g = 174; b = 96;  // Green roof
      } else if (isInDoor) {
        r = 120; g = 66; b = 18;  // Brown door
      } else if (isInBody) {
        r = 52; g = 152; b = 219; // Blue body
      } else {
        r = 255; g = 255; b = 255; // White bg
      }
      
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }
  
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk('IDAT', compressed);
  
  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Create icons directory and icons
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 48, 128].forEach(size => {
  const png = createPNG(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created ${filePath}`);
});

console.log('\n✅ All icons created successfully!');
