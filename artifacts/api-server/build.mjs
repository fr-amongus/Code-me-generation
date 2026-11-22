import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(artifactDir, "../..");
const platformSourceRoots = [
  "artifacts/code-me-generation/src",
  "artifacts/api-server/src",
  "lib/db/src",
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
];
const platformSourceFiles = [
  "lib/api-spec/openapi.yaml",
  "artifacts/code-me-generation/package.json",
  "artifacts/api-server/package.json",
];
const sourceExtensions = new Set([".ts", ".tsx", ".css", ".json", ".yaml", ".yml", ".md"]);

async function collectPlatformSource(rootPath, relativeRoot, files) {
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "test") continue;
    const absolutePath = path.join(rootPath, entry.name);
    const relativePath = path.posix.join(relativeRoot, entry.name);
    if (entry.isDirectory()) {
      await collectPlatformSource(absolutePath, relativePath, files);
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(path.extname(entry.name))) continue;
    const contents = await readFile(absolutePath, "utf8");
    if (Buffer.byteLength(contents, "utf8") > 700_000) continue;
    files.push({ path: relativePath, content: contents });
  }
}

async function writePlatformSourceManifest(distDir) {
  const files = [];
  for (const relativeRoot of platformSourceRoots) {
    await collectPlatformSource(path.join(workspaceRoot, relativeRoot), relativeRoot, files);
  }
  for (const relativePath of platformSourceFiles) {
    try {
      files.push({
        path: relativePath,
        content: await readFile(path.join(workspaceRoot, relativePath), "utf8"),
      });
    } catch {
      // Optional source groups may not exist in every workspace checkout.
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(
    path.join(distDir, "platform-source.json"),
    JSON.stringify({ version: 1, files }),
    "utf8",
  );
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
  await writePlatformSourceManifest(distDir);
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
