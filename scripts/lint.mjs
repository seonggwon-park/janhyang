import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const lintedExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".svg"]);
const errors = [];

for (const file of await collectFiles(root)) {
  const relativePath = path.relative(root, file);

  if (relativePath === path.join("data", "db.json")) {
    continue;
  }

  const content = await readFile(file, "utf8");
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (/\s+$/.test(line)) {
      errors.push(`${relativePath}:${index + 1} trailing whitespace`);
    }

    if (line.includes("\t")) {
      errors.push(`${relativePath}:${index + 1} tab character`);
    }
  });

  if (content && !content.endsWith("\n")) {
    errors.push(`${relativePath}: missing final newline`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Lint passed");

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectFiles(path.join(directory, entry.name)));
      }
      continue;
    }

    if (lintedExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}
