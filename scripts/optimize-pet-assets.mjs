import { join } from "node:path";
import sharp from "sharp";

const sourceDir = join(process.cwd(), "public", "pet-clean");
const frameSize = 192;
const animations = [
  { name: "idle", frames: 8 },
  { name: "happy", frames: 8 },
  { name: "sleep", frames: 8 },
  { name: "tap", frames: 6 },
  { name: "wake", frames: 6 },
];

await Promise.all(
  animations.map(async ({ name, frames }) => {
    const input = join(sourceDir, `${name}.png`);
    const output = join(sourceDir, `${name}.webp`);

    await sharp(input)
      .resize(frames * frameSize, frameSize, { fit: "fill", kernel: sharp.kernel.lanczos3 })
      .webp({ quality: 82, alphaQuality: 100, effort: 6 })
      .toFile(output);
  }),
);

console.log(`Optimized ${animations.length} pet sprites to ${frameSize}px-per-frame WebP sheets.`);
