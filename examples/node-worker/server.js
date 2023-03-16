import * as path from "node:path";
import * as nodeURL from "node:url";

import compression from "compression";
import express from "express";

// @ts-ignore
import { createApp } from "./build/entry.server.js";
// @ts-ignore
import rscManifest, { browserManifest } from "./build/manifest.rsc.js";
// @ts-ignore
import serverManifest from "./build/manifest.server.js";
// @ts-ignore
import runtime from "./build/runtime.js";

global.__webpack_chunk_load__ = (id) => {
  return (runtime.__webpack_chunk_load__ || runtime.e)(id);
};
global.__webpack_require__ = runtime;

const __dirname = path.dirname(nodeURL.fileURLToPath(import.meta.url));

const app = express();

app.use(compression());

app.use(express.static("public"));

app.all(
  "*",
  createApp(
    path.resolve(__dirname, "build/entry.rsc.js"),
    rscManifest,
    serverManifest,
    browserManifest
  )
);

const port = Number(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`Server started on http://localhost:${port}`);
});
