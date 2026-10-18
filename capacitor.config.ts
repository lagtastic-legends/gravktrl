import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gravktrl.app",
  appName: "GravKtrl",
  webDir: "out",
  server: {
    cleartext: true,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
