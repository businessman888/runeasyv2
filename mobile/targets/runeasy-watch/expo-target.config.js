/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "RunEasyWatch",
  bundleIdentifier: "com.oytotec.runeasy.watchkitapp",
  icon: "../../assets/icon.png",
  deploymentTarget: "10.0",
  frameworks: ["HealthKit", "WatchKit", "WatchConnectivity", "CoreLocation", "MapKit", "AVFAudio"],
};
