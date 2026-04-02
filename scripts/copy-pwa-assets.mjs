import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "assets", "Public");
const outputDir = path.join(repoRoot, "dist");

const files = [
  "manifest.json",
  "sw.js",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "Bluprint favicon.png",
];

await mkdir(outputDir, { recursive: true });

await Promise.all(
  files.map((fileName) =>
    copyFile(path.join(sourceDir, fileName), path.join(outputDir, fileName)),
  ),
);
