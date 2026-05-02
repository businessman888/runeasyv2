const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const TARGET_FOLDER = 'runeasy-watch';
const TARGET_NAME = 'RunEasyWatch';

function copyIfPresent(srcPath, destPath, label) {
  if (!fs.existsSync(srcPath)) {
    console.warn(`[withAppleWatch] Source ${label} not found at ${srcPath}, skipping`);
    return false;
  }
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    console.warn(`[withAppleWatch] Destination dir ${destDir} not found (target not yet scaffolded by @bacons/apple-targets?), skipping ${label}`);
    return false;
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`[withAppleWatch] Synced ${label} → ${destPath}`);
  return true;
}

function withWatchInfoPlistOverride(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const root = config.modRequest.projectRoot;
      copyIfPresent(
        path.join(root, 'targets', TARGET_FOLDER, 'Info.plist'),
        path.join(root, 'ios', TARGET_NAME, 'Info.plist'),
        'Info.plist'
      );
      return config;
    },
  ]);
}

function withWatchEntitlementsOverride(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const root = config.modRequest.projectRoot;
      copyIfPresent(
        path.join(root, 'targets', TARGET_FOLDER, `${TARGET_NAME}.entitlements`),
        path.join(root, 'ios', TARGET_NAME, `${TARGET_NAME}.entitlements`),
        'entitlements'
      );
      return config;
    },
  ]);
}

const withAppleWatch = (config) => {
  config = withWatchInfoPlistOverride(config);
  config = withWatchEntitlementsOverride(config);
  return config;
};

module.exports = withAppleWatch;
