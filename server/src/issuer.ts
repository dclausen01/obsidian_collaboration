import Fastify, { type FastifyInstance } from "fastify";
import { DocumentManager, type ClientToken } from "@y-sweet/sdk";

/**
 * The token-issuing "control plane".
 *
 * This is the open replacement for Relay's proprietary control plane. The
 * Obsidian client authenticates here and asks for a token to connect to a
 * specific document; we validate (stub for now) and mint a y-sweet client
 * token using the server auth key held in the connection string.
 *
 * Flow mirrors the Relay client (`src/LiveTokenStore.ts` -> `POST /token`):
 *   request:  { docId, relay?, folder?, device? }   + Authorization: Bearer <user>
 *   response: ClientToken { url, baseUrl, docId, token?, authorization? }
 */
export interface TokenRequestBody {
	docId: string;
	relay?: string;
	folder?: string;
	device?: string;
}

export function buildIssuer(connectionString: string): FastifyInstance {
	const app = Fastify({ logger: true });
	const manager = new DocumentManager(connectionString);

	app.get("/health", async () => {
		// Surface whether the issuer can actually reach the y-sweet store.
		const store = await manager.checkStore().catch((err) => ({
			ok: false as const,
			error: String(err),
		}));
		return { ok: true, ysweet: store };
	});

	app.post<{ Body: TokenRequestBody }>("/token", async (request, reply) => {
		const { docId } = request.body ?? ({} as TokenRequestBody);
		if (!docId || typeof docId !== "string") {
			return reply.code(400).send({ error: "docId is required" });
		}

		// TODO(M2): real authentication + per-relay permission check here.
		// For the MVP we trust the caller and grant full access to the doc.
		const authorization = "full" as const;

		try {
			const clientToken: ClientToken = await manager.getOrCreateDocAndToken(
				docId,
				{ authorization },
			);
			return clientToken;
		} catch (err) {
			request.log.error({ err }, "failed to mint client token");
			return reply
				.code(502)
				.send({ error: "could not reach y-sweet server", detail: String(err) });
		}
	});

	return app;
}
