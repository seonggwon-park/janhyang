import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const directories = ["src", "public", "scripts", "test"];
const files = [];

for (const directory of directories) {
  files.push(...await collectJavaScriptFiles(path.join(root, directory)));
}

for (const file of files) {
  await checkSyntax(file);
}

console.log(`Checked ${files.length} JavaScript files`);

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...await collectJavaScriptFiles(fullPath));
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      found.push(fullPath);
    }
  }

  return found;
}

async function checkSyntax(file) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--check", file], {
      cwd: root,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Syntax check failed for ${path.relative(root, file)}`));
    });
  });
}
