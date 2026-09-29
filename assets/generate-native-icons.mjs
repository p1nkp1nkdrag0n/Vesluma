/** Deterministic native assets derived from the code-owned public/icon.svg.
 * Run: node assets/generate-native-icons.mjs [path-to-sharp-module]
 * Sharp may be provided by the desktop workspace runtime; no project package
 * changes are needed. This script changes only native assets and assets/.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'assets');
const androidResources = join(root, 'android/app/src/main/res');
const iosAssets = join(root, 'ios/App/App/Assets.xcassets');
const jade = '#218675';
const source = await readFile(join(root, 'public/icon.svg'), 'utf8');
const body = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(source)?.[1];
if (!body || !body.includes(jade)) throw new Error('Expected the Vesluma jade compass SVG.');
const squareBody = body.replace(/\srx="112"/, '');
const emblem = body.replace(/<rect\b[^>]*fill="#218675"[^>]*\/>/, '');
const svg = content => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${content}</svg>`;
const opaqueSquare = svg(squareBody);
// Original ticks span 344/512 of the source. The 0.88 scale yields 63.86 dp
// inside Android's 66 dp safe zone on the 108 dp adaptive-icon layer.
const foreground = svg(`<g transform="translate(256 256) scale(.88) translate(-256 -256)">${emblem}</g>`);
const round = svg(`<defs><clipPath id="round"><circle cx="256" cy="256" r="256"/></clipPath></defs><g clip-path="url(#round)">${squareBody}</g>`);
await writeFile(join(sourceRoot, 'native-icon.svg'), opaqueSquare);
await writeFile(join(sourceRoot, 'native-icon-foreground.svg'), foreground);

async function render(content, size, path, opaque = false) {
  let pipeline = sharp(Buffer.from(content)).resize(size, size);
  if (opaque) pipeline = pipeline.flatten({ background: jade }).removeAlpha();
  await pipeline.png().toFile(path);
}
async function solid(width, height, color, path) {
  await sharp({ create: { width, height, channels: 3, background: color } }).png().toFile(path);
}

await render(opaqueSquare, 1024, join(sourceRoot, 'icon-only.png'), true);
await render(foreground, 1024, join(sourceRoot, 'icon-foreground.png'));
await solid(1024, 1024, jade, join(sourceRoot, 'icon-background.png'));
await solid(2732, 2732, '#ffffff', join(sourceRoot, 'splash.png'));
await render(opaqueSquare, 1024, join(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'), true);

const scales = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];
for (const [density, scale] of scales) {
  const directory = join(androidResources, `mipmap-${density}`);
  await render(source, Math.round(48 * scale), join(directory, 'ic_launcher.png'));
  await render(round, Math.round(48 * scale), join(directory, 'ic_launcher_round.png'));
  await render(foreground, Math.round(108 * scale), join(directory, 'ic_launcher_foreground.png'));
}

// Preserve every existing splash's dimensions, replacing the template artwork.
for (const directory of await readdir(androidResources)) {
  if (!directory.startsWith('drawable')) continue;
  const path = join(androidResources, directory, 'splash.png');
  let metadata;
  try { metadata = await sharp(path).metadata(); } catch { continue; }
  await solid(metadata.width, metadata.height, '#ffffff', path);
}
for (const filename of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await solid(2732, 2732, '#ffffff', join(iosAssets, 'Splash.imageset', filename));
}

const foregroundVector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="512" android:viewportHeight="512">
    <group android:pivotX="256" android:pivotY="256" android:scaleX="0.88" android:scaleY="0.88">
        <path android:pathData="M408,256 A152,152 0,1 0,104,256 A152,152 0,1 0,408,256"
            android:fillColor="#00000000" android:strokeColor="#eaf4ef" android:strokeWidth="12"/>
        <path android:pathData="M256,90v26 M256,396v26 M90,256h26 M396,256h26"
            android:strokeColor="#eaf4ef" android:strokeWidth="12" android:strokeLineCap="round"/>
        <path android:pathData="M311,175l-25,111 -111,51 51,-111Z" android:fillColor="#ffffff"/>
        <path android:pathData="M311,175l-25,111 -30,-30Z" android:fillColor="#afdbca"/>
        <path android:pathData="M269,256 A13,13 0,1 0,243,256 A13,13 0,1 0,269,256" android:fillColor="#218675"/>
    </group>
</vector>
`;
await writeFile(join(androidResources, 'drawable-v24/ic_launcher_foreground.xml'), foregroundVector);
await writeFile(join(androidResources, 'drawable/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#218675"/>
</shape>
`);
await writeFile(join(androidResources, 'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#218675</color></resources>
`);

const summary = [];
async function inspect(path, expectedWidth, expectedHeight, expectOpaque = false) {
  const metadata = await sharp(path).metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) throw new Error(`Wrong dimensions: ${path}`);
  if (expectOpaque && metadata.hasAlpha) throw new Error(`Unexpected alpha channel: ${path}`);
  summary.push({ file: path.slice(root.length + 1).replaceAll('\\', '/'), width: metadata.width, height: metadata.height, alpha: metadata.hasAlpha });
}
async function inspectSafeZone(path, scale) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = 0, top = info.height, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (!data[(y * info.width + x) * info.channels + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const limit = Math.ceil(66 * scale) + 2;
  if (right - left + 1 > limit || bottom - top + 1 > limit) throw new Error(`Adaptive emblem exceeds safe zone: ${path}`);
}
async function inspectWhiteSplash(path) {
  const metadata = await sharp(path).metadata();
  const stats = await sharp(path).stats();
  if (metadata.hasAlpha || stats.channels.some(channel => channel.min !== 255 || channel.max !== 255)) {
    throw new Error(`Splash is not opaque plain white: ${path}`);
  }
  summary.push({ file: path.slice(root.length + 1).replaceAll('\\', '/'), width: metadata.width, height: metadata.height, alpha: false, color: '#ffffff' });
}
await inspect(join(iosAssets, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024, 1024, true);
for (const [density, scale] of scales) {
  const directory = join(androidResources, `mipmap-${density}`);
  await inspect(join(directory, 'ic_launcher.png'), Math.round(48 * scale), Math.round(48 * scale));
  await inspect(join(directory, 'ic_launcher_round.png'), Math.round(48 * scale), Math.round(48 * scale));
  await inspect(join(directory, 'ic_launcher_foreground.png'), Math.round(108 * scale), Math.round(108 * scale));
  await inspectSafeZone(join(directory, 'ic_launcher_foreground.png'), scale);
}
for (const directory of await readdir(androidResources)) {
  if (!directory.startsWith('drawable')) continue;
  const path = join(androidResources, directory, 'splash.png');
  try { await readFile(path); } catch { continue; }
  await inspectWhiteSplash(path);
}
for (const filename of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await inspectWhiteSplash(join(iosAssets, 'Splash.imageset', filename));
}
await writeFile(join(sourceRoot, 'native-icon-dimensions.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Verified ${summary.length} native icon/splash images. iOS 1024px is RGB opaque; Android covers five densities within the safe zone; all splashes are opaque white.`);
