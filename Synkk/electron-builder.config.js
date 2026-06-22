/**
 * @type {import('electron-builder').Configuration}
 */
const config = {
  appId: "com.synkk.app",
  productName: "Synkk",
  directories: {
    output: "dist-electron",
    buildResources: "public"
  },
  files: [
    "dist/**/*",
    "dist-main/**/*",
    "public/**/*"
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    icon: "public/icon.png"
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    runAfterFinish: true,
    shortcutName: "Synkk",
    artifactName: "Synkk-Setup.exe"
  },
  publish: {
    provider: "github",
    owner: "Surge-Ogiemudia",
    repo: "synkk-downloads"
  }
};

module.exports = config;
