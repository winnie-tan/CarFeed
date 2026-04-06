const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../../..");
const rootDistDir = path.join(projectRoot, "dist");
const outputsDistDir = path.join(projectRoot, "03-outputs", "dist");
const dataSrcDir = path.join(projectRoot, "02-inputs", "data");
const dataDistDirs = [rootDistDir, outputsDistDir];
const previewSrc = path.join(projectRoot, "preview.html");
const indexDistPaths = [
  path.join(rootDistDir, "index.html"),
  path.join(outputsDistDir, "index.html")
];
const previewDistPaths = [
  path.join(rootDistDir, "preview.html"),
  path.join(outputsDistDir, "preview.html")
];
const verificationFiles = [
  "19875c79ee287a8e639c152098f54323.txt"
];

for (const distDir of dataDistDirs) {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(distDir, "data"), { recursive: true });
}

for (const indexDist of indexDistPaths) {
  fs.copyFileSync(previewSrc, indexDist);
}

for (const previewDist of previewDistPaths) {
  fs.copyFileSync(previewSrc, previewDist);
}

for (const file of fs.readdirSync(dataSrcDir)) {
  if (!file.endsWith(".json")) continue;
  for (const distDir of dataDistDirs) {
    fs.copyFileSync(path.join(dataSrcDir, file), path.join(distDir, "data", file));
  }
}

for (const file of verificationFiles) {
  const sourcePath = path.join(projectRoot, file);
  if (fs.existsSync(sourcePath)) {
    for (const distDir of dataDistDirs) {
      fs.copyFileSync(sourcePath, path.join(distDir, file));
    }
  }
}

console.log(`Built static site into ${rootDistDir} and ${outputsDistDir}`);
