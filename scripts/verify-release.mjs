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
const frontendPackage = JSON.parse(read("frontend/package.json"));
const version = rootPackage.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json version ${JSON.stringify(version)} is not semantic x.y.z`);
}

if (frontendPackage.version !== version) {
  fail(`frontend/package.json is ${frontendPackage.version}, expected ${version}`);
}

const backendConfig = read("backend/app/config.py");
const backendVersion = backendConfig.match(
  /self\.version\s*=\s*os\.getenv\("APP_VERSION",\s*"([^"]+)"\)/,
)?.[1];

if (backendVersion !== version) {
  fail(`backend default version is ${backendVersion ?? "missing"}, expected ${version}`);
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

console.log(`NoteVault v${version} release metadata is consistent.`);
