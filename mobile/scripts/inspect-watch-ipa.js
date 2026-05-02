const fs = require('fs');
const path = require('path');
const plist = require('plist');
const bplistParser = require('bplist-parser');

const ROOT = 'C:/Users/marti/AppData/Local/Temp/runeasy-ipa-check/extracted/Payload/RunEasy.app';
const WATCH_APP = path.join(ROOT, 'Watch/RunEasyWatch.app');

function readPlist(p) {
  const buf = fs.readFileSync(p);
  // Detect binary plist (magic "bplist00")
  if (buf.slice(0, 6).toString('ascii') === 'bplist') {
    return bplistParser.parseBuffer(buf)[0];
  }
  return plist.parse(buf.toString('utf8'));
}

function pick(obj, keys) {
  return keys.reduce((acc, k) => {
    if (k in obj) acc[k] = obj[k];
    return acc;
  }, {});
}

console.log('=== iOS App Info.plist (relevant keys) ===');
const iosInfo = readPlist(path.join(ROOT, 'Info.plist'));
console.log(JSON.stringify(pick(iosInfo, [
  'CFBundleIdentifier',
  'CFBundleVersion',
  'CFBundleShortVersionString',
  'WKAppBundleIdentifier',
  'NSHealthShareUsageDescription',
]), null, 2));

console.log('\n=== Watch App Info.plist (full) ===');
const watchInfo = readPlist(path.join(WATCH_APP, 'Info.plist'));
console.log(JSON.stringify(watchInfo, null, 2));

console.log('\n=== Watch App critical keys check ===');
const checks = [
  ['CFBundleIdentifier', 'com.oytotec.runeasy.watchkitapp'],
  ['WKApplication', true],
  ['WKCompanionAppBundleIdentifier', 'com.oytotec.runeasy'],
];
checks.forEach(([key, expected]) => {
  const got = watchInfo[key];
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key}: got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`);
});

console.log('\n=== Watch app file listing ===');
fs.readdirSync(WATCH_APP).forEach(f => {
  const stat = fs.statSync(path.join(WATCH_APP, f));
  console.log(`  ${f} ${stat.isDirectory() ? '(dir)' : '(' + stat.size + ' bytes)'}`);
});

console.log('\n=== Watch binary architectures (Mach-O magic check) ===');
const binPath = path.join(WATCH_APP, 'RunEasyWatch');
if (fs.existsSync(binPath)) {
  const bin = fs.readFileSync(binPath);
  const magic = bin.readUInt32BE(0);
  console.log(`First 4 bytes (BE hex): 0x${magic.toString(16)}`);
  // FAT magic = 0xcafebabe / 0xbebafeca; thin Mach-O = 0xfeedface (32) / 0xfeedfacf (64)
  const magicMap = {
    0xfeedface: 'Mach-O 32-bit (BE/LE thin)',
    0xfeedfacf: 'Mach-O 64-bit (LE thin)',
    0xcffaedfe: 'Mach-O 64-bit (LE thin)',
    0xcefaedfe: 'Mach-O 32-bit (LE thin)',
    0xcafebabe: 'FAT (multi-arch)',
    0xbebafeca: 'FAT (swapped)',
  };
  console.log('Type:', magicMap[magic] || 'Unknown');
  console.log('Binary size:', bin.length, 'bytes');
}

console.log('\n=== embedded.mobileprovision (entitlements via plist scan) ===');
const profPath = path.join(WATCH_APP, 'embedded.mobileprovision');
if (fs.existsSync(profPath)) {
  const profBuf = fs.readFileSync(profPath);
  const txt = profBuf.toString('utf8');
  const start = txt.indexOf('<?xml');
  const end = txt.indexOf('</plist>') + 8;
  if (start >= 0 && end > start) {
    const xmlSection = txt.slice(start, end);
    try {
      const prof = plist.parse(xmlSection);
      console.log('AppIDName:', prof.AppIDName);
      console.log('TeamIdentifier:', prof.TeamIdentifier);
      console.log('Entitlements (subset):');
      const ent = prof.Entitlements || {};
      console.log(JSON.stringify({
        'application-identifier': ent['application-identifier'],
        'com.apple.developer.healthkit': ent['com.apple.developer.healthkit'],
        'com.apple.developer.healthkit.access': ent['com.apple.developer.healthkit.access'],
        'com.apple.developer.team-identifier': ent['com.apple.developer.team-identifier'],
      }, null, 2));
    } catch (e) {
      console.log('Could not parse mobileprovision XML:', e.message);
    }
  }
}
