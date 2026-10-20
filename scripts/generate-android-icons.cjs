const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const logoSvg = path.join(__dirname, '..', 'public', 'gravktrl-logo.svg');

// Mipmap densities and icon sizes
const MIPMAP_CONFIG = [
  { dir: 'mipmap-mdpi', iconSize: 48, fgSize: 108, logoInFg: 72 },
  { dir: 'mipmap-hdpi', iconSize: 72, fgSize: 162, logoInFg: 108 },
  { dir: 'mipmap-xhdpi', iconSize: 96, fgSize: 216, logoInFg: 144 },
  { dir: 'mipmap-xxhdpi', iconSize: 144, fgSize: 324, logoInFg: 216 },
  { dir: 'mipmap-xxxhdpi', iconSize: 192, fgSize: 432, logoInFg: 288 },
];

// Splash screen configurations (landscape and portrait)
const SPLASH_CONFIG = [
  { dir: 'drawable', width: 480, height: 320, logoSize: 160 },
  { dir: 'drawable-land-mdpi', width: 480, height: 320, logoSize: 160 },
  { dir: 'drawable-land-hdpi', width: 800, height: 480, logoSize: 240 },
  { dir: 'drawable-land-xhdpi', width: 1280, height: 720, logoSize: 360 },
  { dir: 'drawable-land-xxhdpi', width: 1600, height: 960, logoSize: 480 },
  { dir: 'drawable-land-xxxhdpi', width: 1920, height: 1280, logoSize: 640 },
  { dir: 'drawable-port-mdpi', width: 320, height: 480, logoSize: 180 },
  { dir: 'drawable-port-hdpi', width: 480, height: 800, logoSize: 260 },
  { dir: 'drawable-port-xhdpi', width: 720, height: 1280, logoSize: 380 },
  { dir: 'drawable-port-xxhdpi', width: 960, height: 1600, logoSize: 500 },
  { dir: 'drawable-port-xxxhdpi', width: 1280, height: 1920, logoSize: 640 },
];

async function generateIcons() {
  console.log('🚀 Generating GravKtrl Android app icons and splash screens...');

  // 1. Generate Mipmap Icons (ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png)
  for (const item of MIPMAP_CONFIG) {
    const targetFolder = path.join(resDir, item.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // A. ic_launcher.png (Full Icon with Dark Background)
    const iconBuffer = await sharp(logoSvg)
      .resize(item.iconSize, item.iconSize)
      .png()
      .toBuffer();
    
    fs.writeFileSync(path.join(targetFolder, 'ic_launcher.png'), iconBuffer);

    // B. ic_launcher_round.png (Circular masked icon)
    // Create circular SVG mask
    const r = item.iconSize / 2;
    const circleSvg = Buffer.from(
      `<svg width="${item.iconSize}" height="${item.iconSize}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`
    );
    const roundIconBuffer = await sharp(iconBuffer)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetFolder, 'ic_launcher_round.png'), roundIconBuffer);

    // C. ic_launcher_foreground.png (Centered transparent logo in safe zone of fgSize canvas)
    const resizedLogo = await sharp(logoSvg)
      .resize(item.logoInFg, item.logoInFg)
      .png()
      .toBuffer();

    const fgCanvas = await sharp({
      create: {
        width: item.fgSize,
        height: item.fgSize,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{
        input: resizedLogo,
        top: Math.round((item.fgSize - item.logoInFg) / 2),
        left: Math.round((item.fgSize - item.logoInFg) / 2)
      }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetFolder, 'ic_launcher_foreground.png'), fgCanvas);

    console.log(`   ✓ [${item.dir}] Generated ic_launcher (${item.iconSize}px), round, and foreground (${item.fgSize}px)`);
  }

  // 2. Generate Splash Screens (Obsidian Dark Background + Centered GravKtrl Logo)
  for (const s of SPLASH_CONFIG) {
    const targetFolder = path.join(resDir, s.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const splashLogo = await sharp(logoSvg)
      .resize(s.logoSize, s.logoSize)
      .png()
      .toBuffer();

    const splashImg = await sharp({
      create: {
        width: s.width,
        height: s.height,
        channels: 4,
        background: { r: 3, g: 7, b: 18, alpha: 1 } // #030712 obsidian dark
      }
    })
      .composite([{
        input: splashLogo,
        top: Math.round((s.height - s.logoSize) / 2),
        left: Math.round((s.width - s.logoSize) / 2)
      }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetFolder, 'splash.png'), splashImg);
    console.log(`   ✓ [${s.dir}] Generated splash.png (${s.width}x${s.height})`);
  }

  // 3. Update XML resource configurations
  // A. values/ic_launcher_background.xml
  const valuesXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#030712</color>
</resources>
`;
  fs.writeFileSync(path.join(resDir, 'values', 'ic_launcher_background.xml'), valuesXml, 'utf8');

  // B. mipmap-anydpi-v26/ic_launcher.xml
  const adaptiveLauncherXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  fs.writeFileSync(path.join(resDir, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptiveLauncherXml, 'utf8');
  fs.writeFileSync(path.join(resDir, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptiveLauncherXml, 'utf8');

  console.log('\n🎉 ALL ANDROID ICONS & SPLASH SCREENS REPLACED WITH OFFICIAL GRAVKTRL LOGO!');
}

generateIcons().catch((err) => {
  console.error('❌ Failed to generate icons:', err);
  process.exit(1);
});
