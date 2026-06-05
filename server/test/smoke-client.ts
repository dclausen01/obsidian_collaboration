/**
 * M0 end-to-end smoke test.
 *
 * Proves the full local loop works:
 *   issuer (/token)  ->  y-sweet client token  ->  WebSocket CRDT sync  ->
 *   persistence across a fresh reconnect.
 *
 * Phase 1 (writer): get a token from the issuer, connect, write Y.Text, flush.
 * Phase 2 (reader): brand-new Y.Doc + provider for the same docId, and assert
 *                   the text written in phase 1 comes back.
 *
 * Exit code 0 = pass, 1 = fail.
 */
import * as Y from "yjs";
import WebSocket from "ws";
import {
	createYjsProvider,
	type YSweetProvider,
} from "@y-sweet/client";
import type { ClientToken } from "@y-sweet/sdk";

const ISSUER_URL = process.env.ISSUER_URL ?? "http://127.0.0.1:3000";
const DOC_ID = process.env.SMOKE_DOC_ID ?? `smoke-${Date.now()}`;
const EXPECTED = `Hello from M0 @ ${new Date().toISOString()}`;
const TIMEOUT_MS = 10_000;

/** Ask the issuer for a y-sweet client token for DOC_ID. */
async function fetchToken(): Promise<ClientToken> {
	const res = await fetch(`${ISSUER_URL}/token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: "Bearer dev-stub-user",
		},
		body: JSON.stringify({ docId: DOC_ID }),
	});
	if (!res.ok) {
		throw new Error(`issuer /token returned ${res.status}: ${await res.text()}`);
	}
	return (await res.json()) as ClientToken;
}

function connect(doc: Y.Doc): YSweetProvider {
	return createYjsProvider(doc, DOC_ID, fetchToken, {
		connect: true,
		showDebuggerLink: false,
		// y-sweet's browser client needs a WebSocket impl in Node.
		WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
	});
}

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((_, reject) =>
			setTimeout(() => reject(new Error(`timeout: ${label}`)), TIMEOUT_MS),
		),
	]);
}

/** Resolve once `ytext` reaches the expected content. */
function waitForText(doc: Y.Doc, expected: string): Promise<void> {
	const ytext = doc.getText("content");
	return withTimeout(
		new Promise<void>((resolve) => {
			const check = () => {
				if (ytext.toString() === expected) resolve();
			};
			ytext.observe(check);
			check();
		}),
		"text to converge",
	);
}

async function main(): Promise<void> {
	console.log(`[smoke] issuer=${ISSUER_URL} docId=${DOC_ID}`);

	// --- Phase 1: write ---
	const writeDoc = new Y.Doc();
	const writer = connect(writeDoc);
	await withTimeout(
		new Promise<void>((resolve) => writer.on("sync", () => resolve())),
		"writer initial sync",
	);
	writeDoc.getText("content").insert(0, EXPECTED);
	console.log(`[smoke] wrote: "${EXPECTED}"`);
	// Give the update time to flush to the server, then drop the connection.
	await new Promise((r) => setTimeout(r, 1500));
	writer.destroy();
	console.log("[smoke] writer disconnected");

	// --- Phase 2: reconnect fresh and verify ---
	const readDoc = new Y.Doc();
	const reader = connect(readDoc);
	await waitForText(readDoc, EXPECTED);
	const got = readDoc.getText("content").toString();
	reader.destroy();

	if (got !== EXPECTED) {
		throw new Error(`mismatch: expected "${EXPECTED}", got "${got}"`);
	}
	console.log(`[smoke] verified after reconnect: "${got}"`);
	console.log("[smoke] PASS ✅");
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("[smoke] FAIL ❌", err);
		process.exit(1);
	});
