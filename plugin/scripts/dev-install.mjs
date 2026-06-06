#!/usr/bin/env node
/**
 * Dev installer for local-auth testing (M1).
 *
 * Builds the plugin once per target vault — each with its own stub identity and
 * pointed at our local issuer — then copies the artifacts into the vault and
 * enables the plugin. Lets you spin up two (or more) collaborating vaults with
 * a single command. See docs/local-dev.md for the full workflow.
 *
 * Usage:
 *   node scripts/dev-install.mjs \
 *     --server http://127.0.0.1:3000 \
 *     --vault "/path/to/Vault A" --name Alice --email alice@localhost \
 *     --vault "/path/to/Vault B" --name Bob   --email bob@localhost
 *
 * Flags:
 *   --server <url>   Issuer base URL (sets both API and AUTH). Default
 *                    http://127.0.0.1:3000. Override individually with
 *                    --api <url> / --auth <url>.
 *   --relay <uuid>   LOCAL_RELAY_ID shared by all vaults (default: the built-in).
 *   --vault <path>   Starts a new target. Repeat for multiple vaults.
 *   --name <name>    Display name for the preceding --vault's stub identity.
 *   --email <email>  Email/id for the preceding --vault's stub identity.
 *   --no-enable      Don't touch community-plugins.json (install only).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ID = JSON.parse(
	readFileSync(join(PLUGIN_DIR, "manifest.json"), "utf8"),
).id;
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

function parseArgs(argv) {
	const opts = {
		server: "http://127.0.0.1:3000",
		api: undefined,
		auth: undefined,
		relay: undefined,
		enable: true,
		targets: [],
	};
	let cur = null;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const next = () => argv[++i];
		switch (a) {
			case "--server": opts.server = next(); break;
			case "--api": opts.api = next(); break;
			case "--auth": opts.auth = next(); break;
			case "--relay": opts.relay = next(); break;
			case "--no-enable": opts.enable = false; break;
			case "--vault":
				cur = { vault: next(), name: undefined, email: undefined };
				opts.targets.push(cur);
				break;
			case "--name":
				if (!cur) fail("--name must follow a --vault");
				cur.name = next();
				break;
			case "--email":
				if (!cur) fail("--email must follow a --vault");
				cur.email = next();
				break;
			default:
				fail(`unknown argument: ${a}`);
		}
	}
	return opts;
}

function fail(msg) {
	console.error(`[dev-install] error: ${msg}`);
	process.exit(1);
}

function buildFor(target, opts) {
	const env = {
		...process.env,
		OBSIDIAN_COLLAB_API_URL: opts.api ?? opts.server,
		OBSIDIAN_COLLAB_AUTH_URL: opts.auth ?? opts.server,
		OBSIDIAN_COLLAB_LOCAL_AUTH: "true",
		OBSIDIAN_COLLAB_LOCAL_AUTH_NAME: target.name,
		OBSIDIAN_COLLAB_LOCAL_AUTH_EMAIL: target.email,
	};
	if (opts.relay) env.OBSIDIAN_COLLAB_LOCAL_RELAY_ID = opts.relay;
	console.log(`[dev-install] building for ${target.name} <${target.email}>`);
	execFileSync("node", ["esbuild.config.mjs", "develop"], {
		cwd: PLUGIN_DIR,
		env,
		stdio: "inherit",
	});
}

function installInto(vault) {
	const obsidian = join(vault, ".obsidian");
	if (!existsSync(obsidian)) {
		fail(`not an Obsidian vault (no .obsidian dir): ${vault}`);
	}
	const dest = join(obsidian, "plugins", PLUGIN_ID);
	mkdirSync(dest, { recursive: true });
	for (const f of ARTIFACTS) {
		copyFileSync(join(PLUGIN_DIR, f), join(dest, f));
	}
	console.log(`[dev-install] installed ${PLUGIN_ID} -> ${dest}`);
	return obsidian;
}

function enablePlugin(obsidian) {
	const file = join(obsidian, "community-plugins.json");
	let list = [];
	if (existsSync(file)) {
		try {
			list = JSON.parse(readFileSync(file, "utf8"));
			if (!Array.isArray(list)) list = [];
		} catch {
			list = [];
		}
	}
	if (!list.includes(PLUGIN_ID)) {
		list.push(PLUGIN_ID);
		writeFileSync(file, JSON.stringify(list, null, 2) + "\n");
		console.log(`[dev-install] enabled ${PLUGIN_ID} in community-plugins.json`);
	} else {
		console.log(`[dev-install] ${PLUGIN_ID} already enabled`);
	}
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.targets.length === 0) {
		fail("no --vault targets given (see header for usage)");
	}
	for (const t of opts.targets) {
		if (!t.name || !t.email) {
			fail(`vault "${t.vault}" is missing --name or --email`);
		}
	}
	for (const t of opts.targets) {
		buildFor(t, opts);
		const obsidian = installInto(resolve(t.vault));
		if (opts.enable) enablePlugin(obsidian);
	}
	console.log(
		`[dev-install] done. Reload Obsidian (or toggle the plugin) in: ` +
			opts.targets.map((t) => `"${t.vault}"`).join(", "),
	);
}

main();
