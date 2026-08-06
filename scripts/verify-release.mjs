import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function fail(message) {
  console.error(`Release consistency check failed: ${message}`);
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const rootPackage = JSON.parse(read("package.json"));
const rootPackageLock = JSON.parse(read("package-lock.json"));
const frontendPackage = JSON.parse(read("frontend/package.json"));
const frontendPackageLock = JSON.parse(read("frontend/package-lock.json"));
const version = rootPackage.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json version ${JSON.stringify(version)} is not semantic x.y.z`);
}

if (frontendPackage.version !== version) {
  fail(`frontend/package.json is ${frontendPackage.version}, expected ${version}`);
}

for (const [label, lock] of [
  ["package-lock.json", rootPackageLock],
  ["frontend/package-lock.json", frontendPackageLock],
]) {
  if (lock.version !== version || lock.packages?.[""]?.version !== version) {
    fail(`${label} root package metadata does not match ${version}`);
  }
}

const backendProject = read("backend/pyproject.toml");
const backendProjectVersion = backendProject.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
if (backendProjectVersion !== version) {
  fail(`backend/pyproject.toml is ${backendProjectVersion ?? "missing"}, expected ${version}`);
}

const backendConfig = read("backend/app/config.py");
const backendVersion = backendConfig.match(
  /self\.version\s*=\s*os\.getenv\("APP_VERSION",\s*"([^"]+)"\)/,
)?.[1];

if (backendVersion !== version) {
  fail(`backend default version is ${backendVersion ?? "missing"}, expected ${version}`);
}

const environmentExample = read(".env.example");
const exampleVersion = environmentExample.match(/^APP_VERSION=([^\s#]+)$/m)?.[1];
if (exampleVersion !== version) {
  fail(`.env.example APP_VERSION is ${exampleVersion ?? "missing"}, expected ${version}`);
}

const requiredAiEnvironment = [
  "SILICONFLOW_API_KEY=YOUR_SILICONFLOW_API_KEY_HERE",
  "SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1",
  "SILICONFLOW_MODEL=deepseek-ai/DeepSeek-V4-Flash",
  "SILICONFLOW_TIMEOUT_SECONDS=45",
  "SILICONFLOW_MAX_TOKENS=4096",
  "SILICONFLOW_AI_RATE_LIMIT_PER_MINUTE=10",
];
for (const entry of requiredAiEnvironment) {
  if (!environmentExample.split(/\r?\n/).includes(entry)) {
    fail(`.env.example is missing ${entry.split("=")[0]}`);
  }
}
if (/^VITE_[A-Z0-9_]*SILICONFLOW[A-Z0-9_]*=/m.test(environmentExample)) {
  fail(".env.example exposes SiliconFlow configuration through VITE_*");
}

const runtimeRequirements = read("backend/requirements.txt");
const requirementsHttpx = runtimeRequirements.match(/^httpx==([^\s#]+)$/m)?.[1];
const projectHttpx = backendProject.match(/"httpx==([^"]+)"/)?.[1];
if (!requirementsHttpx || requirementsHttpx !== projectHttpx) {
  fail("httpx runtime pin must match in backend/requirements.txt and backend/pyproject.toml");
}

const openApi = JSON.parse(read("backend/openapi.json"));
if (openApi.info?.version !== version) {
  fail(`OpenAPI version is ${openApi.info?.version ?? "missing"}, expected ${version}`);
}

const changelog = read("CHANGELOG.md");
const changelogHeading = new RegExp(`^##\\s+(?:\\[)?${escapeRegExp(version)}(?:\\])?\\b`, "m");
if (!changelogHeading.test(changelog)) {
  fail(`CHANGELOG.md has no ${version} release heading`);
}

const releaseNotesPath = `docs/release-notes-v${version}.md`;
if (!existsSync(path.join(repositoryRoot, releaseNotesPath))) {
  fail(`${releaseNotesPath} is missing`);
}

const releaseNotes = read(releaseNotesPath);
if (!releaseNotes.startsWith(`# NoteVault v${version}`)) {
  fail(`${releaseNotesPath} does not start with the expected release title`);
}

const readme = read("README.md");
if (!readme.includes(`shields.io/badge/version-${version}-blue`)) {
  fail(`README.md version badge does not match ${version}`);
}
if (!readme.includes(`docs/release-notes-v${version}.md`)) {
  fail(`README.md does not link ${releaseNotesPath}`);
}

console.log(`NoteVault v${version} release metadata is consistent.`);
