/**
 * sync-webapp.js
 *
 * Orquestra a sincronizacao do widget HTML:
 * 1) valida paths do Element-Viewer
 * 2) garante dependencias
 * 3) build do Element-Viewer
 * 4) gera api/html-content.js (embed)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mcpRoot = path.resolve(__dirname, "..");
const webappRoot = path.resolve(__dirname, "../../Element-Viewer");
const webappPackageJson = path.resolve(webappRoot, "package.json");
const webappPackageLock = path.resolve(webappRoot, "package-lock.json");
const webappNodeModules = path.resolve(webappRoot, "node_modules");
const embedScript = path.resolve(mcpRoot, "scripts/embed-html.js");

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCmd = process.execPath;

function fail(message) {
  console.error(`[sync-webapp] ERROR: ${message}`);
  process.exit(1);
}

function runStep(label, command, args, cwd) {
  const quoted = [command, ...args]
    .map((value) =>
      /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value
    )
    .join(" ");

  console.log(`[sync-webapp] ${label}`);
  console.log(`[sync-webapp] > ${quoted} (cwd: ${cwd})`);

  try {
    execSync(quoted, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    const code = typeof error?.status === "number" ? error.status : 1;
    fail(`${label} falhou com exit code ${code}`);
  }
}

console.log("[sync-webapp] Iniciando sincronizacao do webapp...");

if (!fs.existsSync(webappRoot)) {
  fail(`Pasta do webapp nao encontrada: ${webappRoot}`);
}
if (!fs.existsSync(webappPackageJson)) {
  fail(`package.json do webapp nao encontrado: ${webappPackageJson}`);
}
if (!fs.existsSync(webappPackageLock)) {
  fail(`package-lock.json do webapp nao encontrado: ${webappPackageLock}`);
}
if (!fs.existsSync(embedScript)) {
  fail(`Script de embed nao encontrado: ${embedScript}`);
}

const isCI = process.env.CI === "true" || process.env.VERCEL === "1";

if (isCI) {
  runStep(
    "Instalando dependencias do Element-Viewer (CI/Vercel)",
    npmCmd,
    ["ci", "--include=dev"],
    webappRoot
  );
} else if (!fs.existsSync(webappNodeModules)) {
  runStep(
    "Instalando dependencias do Element-Viewer (dev local)",
    npmCmd,
    ["install", "--include=dev"],
    webappRoot
  );
} else {
  console.log("[sync-webapp] Dependencias ja presentes em Element-Viewer/node_modules. Pulando install.");
}

runStep("Build do Element-Viewer", npmCmd, ["run", "build"], webappRoot);
runStep("Embed do HTML no MCP", nodeCmd, [embedScript], mcpRoot);

console.log("[sync-webapp] Sincronizacao concluida com sucesso.");
