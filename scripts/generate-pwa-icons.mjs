import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(process.cwd(), 'public/icons/source.svg'));
const outDir = join(process.cwd(), 'public/icons');
mkdirSync(outDir, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];

for (const size of sizes) {
  await sharp(src)
    .resize(size, size)
    .png()
    .toFile(join(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// Maskable: content fills 400x400, padded to 512x512 with background colour.
// Android's safe zone is the inner 80% so the netball sits well clear of the edge.
await sharp(src)
  .resize(400, 400)
  .extend({ top: 56, bottom: 56, left: 56, right: 56, background: '#4051b5' })
  .png()
  .toFile(join(outDir, 'icon-512-maskable.png'));
console.log('✓ icon-512-maskable.png');
