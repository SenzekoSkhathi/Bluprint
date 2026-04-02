import { access, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "assets", "Public");
const outputDir = path.join(repoRoot, "dist");

const files = ["manifest.json", "sw.js", "Bluprint favicon.png"];

async function copyIfExists(fileName) {
  const sourcePath = path.join(sourceDir, fileName);
  const destPath = path.join(outputDir, fileName);

  try {
    await access(sourcePath);
    await copyFile(sourcePath, destPath);
  } catch {
    // Optional assets should not fail production builds.
  }
}

await mkdir(outputDir, { recursive: true });

await Promise.all(files.map((fileName) => copyIfExists(fileName)));
