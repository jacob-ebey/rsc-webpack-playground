import {
  getAssetFromKV,
  NotFoundError,
  MethodNotAllowedError,
} from "@cloudflare/kv-asset-handler";

// @ts-expect-error
import { handleRequest } from "./build/entry.server";
// @ts-expect-error
import serverManifest from "./build/manifest.server";

export default {
  async fetch(request, env, ctx) {
    try {
      return await getAssetFromKV(
        {
          request,
          waitUntil: ctx.waitUntil.bind(ctx),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: JSON.parse(env.__STATIC_CONTENT_MANIFEST),
        }
      );
    } catch (e) {
      if (e instanceof NotFoundError || e instanceof MethodNotAllowedError) {
        // fall through to the SSR handler
      } else {
        return new Response("An unexpected error occurred", { status: 500 });
      }
    }

    const rscResponse = await env.RSC.fetch(request);

    return await handleRequest(request, rscResponse, serverManifest);
  },
} satisfies ExportedHandler<{
  __STATIC_CONTENT: Fetcher;
  __STATIC_CONTENT_MANIFEST: string;
  RSC: Fetcher;
}>;
