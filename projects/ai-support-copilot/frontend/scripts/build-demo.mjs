// Isolated export: keep the native Next.js proxy intact for local development.
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const stage = resolve(root, ".static-build");
mkdirSync(stage, { recursive: true });
cpSync(join(root, "src"), join(stage, "src"), {
  recursive: true,
  filter: (path) => path !== join(root, "src", "app", "api"),
});
for (const name of ["package.json", "tsconfig.json", "postcss.config.mjs"])
  cpSync(join(root, name), join(stage, name));
writeFileSync(
  join(stage, "next.config.mjs"),
  'export default {output:"export",poweredByHeader:false,devIndicators:false};\n',
);
const result = spawnSync(
  process.execPath,
  [join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"],
  {
    cwd: stage,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  },
);
process.exit(result.status ?? 1);
