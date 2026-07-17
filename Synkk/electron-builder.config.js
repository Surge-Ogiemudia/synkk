/**
 * @type {import('electron-builder').Configuration}
 */
const config = {
  appId: "com.pharmastackx.terminal",
  productName: "PharmaStackX Terminal",
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
    shortcutName: "PharmaStackX Terminal",
    artifactName: "PharmaStackX-Terminal-Setup-${version}.exe"
  },
  publish: {
    provider: "github",
    owner: "Surge-Ogiemudia",
    repo: "synkk-downloads"
  }
};

module.exports = config;
