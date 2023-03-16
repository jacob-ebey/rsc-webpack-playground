// @ts-expect-error
import { handleRequest } from "./build/entry.rsc";
// @ts-expect-error
import rscManifest, { browserManifest } from "./build/manifest.rsc";

export default {
  fetch(request) {
    return handleRequest(request, rscManifest, browserManifest);
  },
} satisfies ExportedHandler;
