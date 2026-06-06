#!/usr/bin/env node
/**
 * Generate a y-sweet auth pair and print it as .env lines:
 *
 *   ./scripts/gen-auth.mjs >> .env
 *
 * Requires the y-sweet binary locally (after `npm install` in server/). If you
 * have no local Node toolchain, generate it via the built image instead:
 *
 *   docker compose run --rm --no-deps --entrypoint "" y-sweet \
 *     npx --no-install y-sweet gen-auth --json
 *
 * The private key (Y_SWEET_AUTH) goes to the y-sweet server; the matching
 * server token (Y_SWEET_SERVER_TOKEN) is what the issuer uses to mint tokens.
 */
import { execFileSync } from "node:child_process";

const json = execFileSync(
	"npx",
	["--no-install", "y-sweet", "gen-auth", "--json"],
	{ encoding: "utf8" },
);
const { private_key, server_token } = JSON.parse(json);
if (!private_key || !server_token) {
	console.error("[gen-auth] unexpected gen-auth output:", json);
	process.exit(1);
}
process.stdout.write(
	`Y_SWEET_AUTH=${private_key}\nY_SWEET_SERVER_TOKEN=${server_token}\n`,
);
