import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const directory of ["src", "public", "data"]) {
  await cp(path.join(root, directory), path.join(dist, directory), {
    recursive: true,
    filter: (source) => !source.endsWith(path.join("data", "db.json"))
  });
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
packageJson.scripts = {
  start: "node src/server.js"
};

await writeFile(path.join(dist, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
console.log(`Built ${path.relative(root, dist)}`);
