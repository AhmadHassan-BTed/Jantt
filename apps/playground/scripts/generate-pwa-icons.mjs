/**
 * Deterministic PWA icon generator.
 *
 * Renders the Jantt mark from public/favicon.svg into anti-aliased RGBA pixels with a
 * dependency-free rasterizer, then writes standards-compliant PNG files with node:zlib.
 * Every run produces byte-identical output for the same sources.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptDir, "..", "public", "icons");

const SS = 4;
const COLORS = {
  background: [9, 14, 26, 255],
  accent: [56, 189, 248, 255],
  middle: [59, 130, 246, 255],
  lower: [16, 185, 129, 255],
  milestone: [245, 158, 11, 255],
  connector: [148, 163, 184, 255],
  border: [56, 189, 248, 128]
};

function createRaster(size) {
  const dimension = size * SS;
  return {
    size,
    dimension,
    data: new Uint8ClampedArray(dimension * dimension * 4)
  };
}

function blendPixel(raster, x, y, color, coverage) {
  if (coverage <= 0 || x < 0 || y < 0 || x >= raster.dimension || y >= raster.dimension) return;
  const alpha = Math.min(1, coverage) * (color[3] / 255);
  if (alpha <= 0) return;
  const index = (y * raster.dimension + x) * 4;
  const dst = raster.data;
  const dstAlpha = dst[index + 3] / 255;
  const outAlpha = alpha + dstAlpha * (1 - alpha);
  if (outAlpha <= 0) return;
  dst[index] = Math.round((color[0] * alpha + dst[index] * dstAlpha * (1 - alpha)) / outAlpha);
  dst[index + 1] = Math.round((color[1] * alpha + dst[index + 1] * dstAlpha * (1 - alpha)) / outAlpha);
  dst[index + 2] = Math.round((color[2] * alpha + dst[index + 2] * dstAlpha * (1 - alpha)) / outAlpha);
  dst[index + 3] = Math.round(outAlpha * 255);
}

/** Signed distance from a point to a rounded rectangle centered at (cx, cy). */
function roundedRectDistance(px, py, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(px - cx) - halfWidth + radius;
  const qy = Math.abs(py - cy) - halfHeight + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

function fillRoundedRect(raster, cx, cy, width, height, radius, color) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const minX = Math.max(0, Math.floor((cx - halfWidth - 1) * SS));
  const maxX = Math.min(raster.dimension - 1, Math.ceil((cx + halfWidth + 1) * SS));
  const minY = Math.max(0, Math.floor((cy - halfHeight - 1) * SS));
  const maxY = Math.min(raster.dimension - 1, Math.ceil((cy + halfHeight + 1) * SS));
  for (let y = minY; y <= maxY; y += 1) {
    const py = (y + 0.5) / SS;
    for (let x = minX; x <= maxX; x += 1) {
      const px = (x + 0.5) / SS;
      const distance = roundedRectDistance(px, py, cx, cy, halfWidth, halfHeight, radius);
      blendPixel(raster, x, y, color, 0.5 - distance * SS);
    }
  }
}

function strokeRoundedRect(raster, cx, cy, width, height, radius, strokeWidth, color) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const minX = Math.max(0, Math.floor((cx - halfWidth - strokeWidth - 1) * SS));
  const maxX = Math.min(raster.dimension - 1, Math.ceil((cx + halfWidth + strokeWidth + 1) * SS));
  const minY = Math.max(0, Math.floor((cy - halfHeight - strokeWidth - 1) * SS));
  const maxY = Math.min(raster.dimension - 1, Math.ceil((cy + halfHeight + strokeWidth + 1) * SS));
  const halfStroke = strokeWidth / 2;
  for (let y = minY; y <= maxY; y += 1) {
    const py = (y + 0.5) / SS;
    for (let x = minX; x <= maxX; x += 1) {
      const px = (x + 0.5) / SS;
      const distance = Math.abs(roundedRectDistance(px, py, cx, cy, halfWidth, halfHeight, radius));
      blendPixel(raster, x, y, color, 0.5 - (distance - halfStroke) * SS);
    }
  }
}

function strokeSegment(raster, x1, y1, x2, y2, width, color) {
  const minX = Math.max(0, Math.floor((Math.min(x1, x2) - width - 1) * SS));
  const maxX = Math.min(raster.dimension - 1, Math.ceil((Math.max(x1, x2) + width + 1) * SS));
  const minY = Math.max(0, Math.floor((Math.min(y1, y2) - width - 1) * SS));
  const maxY = Math.min(raster.dimension - 1, Math.ceil((Math.max(y1, y2) + width + 1) * SS));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const halfWidth = width / 2;
  for (let y = minY; y <= maxY; y += 1) {
    const py = (y + 0.5) / SS;
    for (let x = minX; x <= maxX; x += 1) {
      const px = (x + 0.5) / SS;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
      const distance = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
      blendPixel(raster, x, y, color, 0.5 - (distance - halfWidth) * SS);
    }
  }
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function strokeCubic(raster, p0, p1, p2, p3, width, color) {
  const steps = 40;
  let previous = p0;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const next = [
      cubicPoint(p0[0], p1[0], p2[0], p3[0], t),
      cubicPoint(p0[1], p1[1], p2[1], p3[1], t)
    ];
    strokeSegment(raster, previous[0], previous[1], next[0], next[1], width, color);
    previous = next;
  }
}

/** Draws the exact favicon mark, scaled and centered inside a square box. */
function drawMark(raster, centerX, centerY, markSize, lineScale) {
  const unit = markSize / 32;
  const left = centerX - markSize / 2;
  const top = centerY - markSize / 2;
  const point = (x, y) => [left + x * unit, top + y * unit];
  const stroke = 2 * unit * lineScale;

  const leftBraceA = point(8.5, 7.5);
  const leftBraceB = point(6.5, 7.5);
  const leftBraceC = point(5.5, 9);
  const leftBraceD = point(5.5, 11.5);
  strokeCubic(raster, leftBraceA, leftBraceB, leftBraceC, leftBraceD, stroke, COLORS.accent);

  const leftBraceE = point(5.5, 13.5);
  const leftBraceF = point(4.5, 15);
  const leftBraceG = point(3.2, 16);
  strokeCubic(raster, leftBraceD, leftBraceE, leftBraceF, leftBraceG, stroke, COLORS.accent);

  const leftBraceH = point(4.5, 17);
  const leftBraceI = point(5.5, 18.5);
  const leftBraceJ = point(5.5, 20.5);
  strokeCubic(raster, leftBraceG, leftBraceH, leftBraceI, leftBraceJ, stroke, COLORS.accent);

  const leftBraceK = point(5.5, 23);
  const leftBraceL = point(6.5, 24.5);
  const leftBraceM = point(8.5, 24.5);
  strokeCubic(raster, leftBraceJ, leftBraceK, leftBraceL, leftBraceM, stroke, COLORS.accent);

  const rightBraceA = point(23.5, 7.5);
  const rightBraceB = point(25.5, 7.5);
  const rightBraceC = point(26.5, 9);
  const rightBraceD = point(26.5, 11.5);
  strokeCubic(raster, rightBraceA, rightBraceB, rightBraceC, rightBraceD, stroke, COLORS.accent);

  const rightBraceE = point(26.5, 13.5);
  const rightBraceF = point(27.5, 15);
  const rightBraceG = point(28.8, 16);
  strokeCubic(raster, rightBraceD, rightBraceE, rightBraceF, rightBraceG, stroke, COLORS.accent);

  const rightBraceH = point(27.5, 17);
  const rightBraceI = point(26.5, 18.5);
  const rightBraceJ = point(26.5, 20.5);
  strokeCubic(raster, rightBraceG, rightBraceH, rightBraceI, rightBraceJ, stroke, COLORS.accent);

  const rightBraceK = point(26.5, 23);
  const rightBraceL = point(25.5, 24.5);
  const rightBraceM = point(23.5, 24.5);
  strokeCubic(raster, rightBraceJ, rightBraceK, rightBraceL, rightBraceM, stroke, COLORS.accent);

  const topBarCenter = point(13.5, 10);
  fillRoundedRect(raster, topBarCenter[0], topBarCenter[1], 8 * unit, 3 * unit, 1.5 * unit, COLORS.accent);

  const connectorA = point(17.5, 10);
  const connectorB = point(19, 10);
  const connectorC = point(19, 14.5);
  const connectorD = point(20, 14.5);
  const connectorWidth = 0.9 * unit * lineScale;
  strokeSegment(raster, connectorA[0], connectorA[1], connectorB[0], connectorB[1], connectorWidth, COLORS.connector);
  strokeSegment(raster, connectorB[0], connectorB[1], connectorC[0], connectorC[1], connectorWidth, COLORS.connector);
  strokeSegment(raster, connectorC[0], connectorC[1], connectorD[0], connectorD[1], connectorWidth, COLORS.connector);

  const middleCenter = point(18, 15.5);
  fillRoundedRect(raster, middleCenter[0], middleCenter[1], 9 * unit, 3 * unit, 1.5 * unit, COLORS.middle);

  const lowerCenter = point(12.75, 21);
  fillRoundedRect(raster, lowerCenter[0], lowerCenter[1], 6.5 * unit, 3 * unit, 1.5 * unit, COLORS.lower);

  // Rotated milestone diamond around (20.7, 21): a 3x3 rounded square.
  const diamondCenter = point(20.7, 21);
  const diamondHalf = (3 * Math.SQRT2 * unit) / 2;
  const minX = Math.max(0, Math.floor((diamondCenter[0] - diamondHalf - 2 * unit) * SS));
  const maxX = Math.min(raster.dimension - 1, Math.ceil((diamondCenter[0] + diamondHalf + 2 * unit) * SS));
  const minY = Math.max(0, Math.floor((diamondCenter[1] - diamondHalf - 2 * unit) * SS));
  const maxY = Math.min(raster.dimension - 1, Math.ceil((diamondCenter[1] + diamondHalf + 2 * unit) * SS));
  for (let y = minY; y <= maxY; y += 1) {
    const py = (y + 0.5) / SS;
    for (let x = minX; x <= maxX; x += 1) {
      const px = (x + 0.5) / SS;
      const dx = px - diamondCenter[0];
      const dy = py - diamondCenter[1];
      const rx = (dx + dy) / Math.SQRT2;
      const ry = (dy - dx) / Math.SQRT2;
      const distance = roundedRectDistance(rx, ry, 0, 0, 1.5 * unit, 1.5 * unit, 0.6 * unit);
      blendPixel(raster, x, y, COLORS.milestone, 0.5 - distance * SS);
    }
  }
}

function downsample(raster) {
  const { size, dimension, data } = raster;
  const pixels = Buffer.alloc(size * size * 4);
  const samples = SS * SS;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const index = ((y * SS + sy) * dimension + (x * SS + sx)) * 4;
          const alpha = data[index + 3] / 255;
          r += data[index] * alpha;
          g += data[index + 1] * alpha;
          b += data[index + 2] * alpha;
          a += alpha;
        }
      }
      const offset = (y * size + x) * 4;
      if (a > 0) {
        pixels[offset] = Math.round(r / a);
        pixels[offset + 1] = Math.round(g / a);
        pixels[offset + 2] = Math.round(b / a);
      }
      pixels[offset + 3] = Math.round((a / samples) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function createIcon(size, { maskable = false, border = false } = {}) {
  const raster = createRaster(size);
  const background = COLORS.background;
  const isAnyIcon = border && !maskable;

  if (isAnyIcon) {
    fillRoundedRect(raster, size / 2, size / 2, size, size, size * 0.265, background);
  } else {
    for (let y = 0; y < raster.dimension; y += 1) {
      for (let x = 0; x < raster.dimension; x += 1) {
        blendPixel(raster, x, y, background, 1);
      }
    }
  }

  const markSize = size * (maskable ? 0.66 : 0.8);
  drawMark(raster, size / 2, size / 2, markSize, Math.max(0.75, size / 512));
  if (border) {
    strokeRoundedRect(
      raster,
      size / 2,
      size / 2,
      size - 2,
      size - 2,
      size * 0.265,
      Math.max(1, size * 0.004),
      COLORS.border
    );
  }
  return encodePng(size, downsample(raster));
}

mkdirSync(outputDir, { recursive: true });

const icons = [
  { file: "icon-192.png", size: 192, options: { border: true } },
  { file: "icon-512.png", size: 512, options: { border: true } },
  { file: "icon-maskable-192.png", size: 192, options: { maskable: true } },
  { file: "icon-maskable-512.png", size: 512, options: { maskable: true } },
  { file: "apple-touch-icon-180.png", size: 180, options: {} }
];

for (const icon of icons) {
  const png = createIcon(icon.size, icon.options);
  writeFileSync(join(outputDir, icon.file), png);
  console.log(`${icon.file}: ${icon.size}x${icon.size}, ${png.length} bytes`);
}
