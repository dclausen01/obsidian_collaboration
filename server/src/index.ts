import { loadConfig } from "./config.js";
import { buildIssuer } from "./issuer.js";

const config = loadConfig();
const app = buildIssuer(config.ysweetConnectionString);

app
	.listen({ host: config.host, port: config.port })
	.then((address) => {
		app.log.info(`token issuer listening at ${address}`);
		app.log.info(`y-sweet connection: ${config.ysweetConnectionString}`);
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
