import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const publicDir = path.resolve("public");
const sourceLogo = path.join(publicDir, "logo.png");

const outputs = [
  {
    file: "logo.png",
    width: 512,
    height: 512,
    format: "png",
    options: { compressionLevel: 9, palette: true, quality: 80 },
  },
  {
    file: "icon-192.png",
    width: 192,
    height: 192,
    format: "png",
    options: { compressionLevel: 9, palette: true, quality: 80 },
  },
  {
    file: "og-image.jpg",
    width: 1200,
    height: 630,
    format: "jpeg",
    options: { quality: 78, mozjpeg: true },
    fit: "cover",
  },
];

const sourceBuffer = await readFile(sourceLogo);
const sourceMeta = await sharp(sourceBuffer).metadata();

for (const output of outputs) {
  let pipeline = sharp(sourceBuffer).rotate();

  if (output.fit === "cover") {
    pipeline = pipeline.resize(output.width, output.height, {
      fit: "cover",
      position: "centre",
    });
  } else {
    pipeline = pipeline.resize(output.width, output.height, {
      fit: "contain",
      background: { r: 29, g: 18, b: 15, alpha: 1 },
    });
  }

  const targetPath = path.join(publicDir, output.file);
  let encoded;

  if (output.format === "jpeg") {
    encoded = await pipeline.jpeg(output.options).toBuffer();
  } else {
    encoded = await pipeline.png(output.options).toBuffer();
  }

  await writeFile(targetPath, encoded);
  console.log(`${output.file}: ${encoded.length} bytes (from ${sourceMeta.width}x${sourceMeta.height})`);
}
