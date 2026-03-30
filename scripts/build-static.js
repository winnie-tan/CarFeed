const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const dataSrcDir = path.join(projectRoot, "data");
const dataDistDir = path.join(distDir, "data");
const previewSrc = path.join(projectRoot, "preview.html");
const indexDist = path.join(distDir, "index.html");
const previewDist = path.join(distDir, "preview.html");

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(dataDistDir, { recursive: true });

fs.copyFileSync(previewSrc, indexDist);
fs.copyFileSync(previewSrc, previewDist);

for (const file of ["articles.json", "archive.json"]) {
  fs.copyFileSync(path.join(dataSrcDir, file), path.join(dataDistDir, file));
}

console.log("Built static site into dist/");
