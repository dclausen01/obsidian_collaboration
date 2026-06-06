/**
 * Runtime configuration for the control-plane / token-issuing service.
 *
 * Everything has a development-friendly default so the service can be started
 * locally without any setup. In production these come from the environment.
 */
export interface IssuerConfig {
	/** Host the issuer HTTP service binds to. */
	host: string;
	/** Port the issuer HTTP service listens on. */
	port: number;
	/**
	 * y-sweet connection string (e.g. `ys://<server_token>@127.0.0.1:8080`).
	 * The issuer uses this to mint per-document client tokens via @y-sweet/sdk.
	 * Generate auth with `npx y-sweet gen-auth` and start the server with
	 * `--auth <private_key>`; the printed connection string goes here.
	 */
	ysweetConnectionString: string;
	/**
	 * How long minted client tokens are valid, in seconds. Surfaced to the
	 * client as a ms-epoch `expiryTime` so it can refresh before expiry.
	 */
	tokenTtlSeconds: number;
}

export function loadConfig(): IssuerConfig {
	return {
		host: process.env.ISSUER_HOST ?? "127.0.0.1",
		port: Number(process.env.ISSUER_PORT ?? 3000),
		// Default points at a local dev y-sweet with no auth.
		ysweetConnectionString:
			process.env.Y_SWEET_CONNECTION_STRING ?? "ys://127.0.0.1:8080",
		tokenTtlSeconds: Number(process.env.TOKEN_TTL_SECONDS ?? 3600),
	};
}
