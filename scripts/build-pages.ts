// Assemble one static page per role from templates/resume.html and roles/<role>/*.html.
// A role overrides a slot by having a <slot>.html file; otherwise roles/fullstack/<slot>.html is used.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface Page {
  readonly role: string;
  readonly out: string;
  readonly root: string;
}

const DEFAULT_ROLE = "fullstack";

const PAGES: readonly Page[] = [
  { role: "fullstack", out: "index.html", root: "" },
  { role: "frontend", out: "frontend/index.html", root: "../" },
  { role: "ai", out: "ai/index.html", root: "../" },
  { role: "web3", out: "web3/index.html", root: "../" },
  { role: "blockchain", out: "blockchain/index.html", root: "../" },
  { role: "blue", out: "blue/index.html", root: "../" },
];

const REPO = resolve(__dirname, "..");
const TEMPLATE_PATH = join(REPO, "templates", "resume.html");
const ROLES_DIR = join(REPO, "roles");
const SLOT_PATTERN = /<!-- slot:([a-z0-9-]+) -->/g;
const GENERATED_NOTE = "<!-- Generated from templates/resume.html. Edit templates/ or roles/, not this file. -->";

class BuildError extends Error {}

function readSnippet(path: string): string {
  // Drop the trailing newline most editors add, so the snippet fits its slot exactly
  return readFileSync(path, "utf8").replace(/\r?\n$/, "");
}

// Local href/src values, e.g. "../css/resume.css" or "../icons/skill-icons.svg#react"
const LOCAL_ASSET_PATTERN = /\b(href|src)="([^"#?:]+)(#[^"]*)?"/g;
const assetHashes = new Map<string, string>();

function assetHash(path: string): string {
  let hash = assetHashes.get(path);
  if (hash === undefined) {
    hash = createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 8);
    assetHashes.set(path, hash);
  }
  return hash;
}

// GitHub Pages lets browsers cache files for 10 minutes, so a changed file keeps its old
// cached copy. Adding ?v=<content hash> gives each version of a file its own URL.
function versionAssets(html: string, pageDir: string): string {
  return html.replace(LOCAL_ASSET_PATTERN, (match, attr: string, url: string, fragment: string | undefined) => {
    const file = join(pageDir, url);
    if (!existsSync(file) || !statSync(file).isFile()) return match;
    return `${attr}="${url}?v=${assetHash(file)}${fragment ?? ""}"`;
  });
}

function roleFiles(role: string): string[] {
  const dir = join(ROLES_DIR, role);
  return existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith(".")) : [];
}

function build(): void {
  const template = readFileSync(TEMPLATE_PATH, "utf8");
  const slots = new Set(Array.from(template.matchAll(SLOT_PATTERN), (m) => m[1] ?? ""));
  const eol = template.includes("\r\n") ? "\r\n" : "\n";

  for (const slot of slots) {
    if (!existsSync(join(ROLES_DIR, DEFAULT_ROLE, `${slot}.html`))) {
      throw new BuildError(`roles/${DEFAULT_ROLE}/${slot}.html is missing (every slot needs a default)`);
    }
  }

  for (const { role, out, root } of PAGES) {
    for (const file of roleFiles(role)) {
      const slot = file.replace(/\.html$/, "");
      if (!file.endsWith(".html") || !slots.has(slot)) {
        throw new BuildError(
          `roles/${role}/${file} does not match any slot. Valid names: ${[...slots].map((s) => `${s}.html`).join(", ")}`
        );
      }
    }

    let html = template.replace(SLOT_PATTERN, (_match, slot: string) => {
      const override = join(ROLES_DIR, role, `${slot}.html`);
      return readSnippet(existsSync(override) ? override : join(ROLES_DIR, DEFAULT_ROLE, `${slot}.html`));
    });
    html = html.replaceAll("{{root}}", root);
    const outPath = join(REPO, out);
    html = versionAssets(html, dirname(outPath));

    const firstLineEnd = html.indexOf(eol);
    html = html.slice(0, firstLineEnd + eol.length) + GENERATED_NOTE + eol + html.slice(firstLineEnd + eol.length);

    const leftover = /<!-- slot:|\{\{/.exec(html);
    if (leftover !== null) {
      throw new BuildError(`${out}: unfilled placeholder near "${html.slice(leftover.index, leftover.index + 40)}"`);
    }

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html);
    console.log(`built ${out}`);
  }
}

try {
  build();
} catch (error: unknown) {
  if (error instanceof BuildError) {
    console.error(`build-pages: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
