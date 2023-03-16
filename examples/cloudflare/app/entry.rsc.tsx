import { createStaticHandler } from "@remix-run/router";
import * as React from "react";
// @ts-expect-error
import RSDWServer from "react-server-dom-webpack/server.edge";

import { routes } from "./config";

export async function handleRequest(
  request: Request,
  manifest: unknown,
  browserManifest: { entry: string; chunks: string[] }
): Promise<Response> {
  const staticHandler = createStaticHandler(routes);

  const context = await staticHandler.query(request);
  if (context instanceof Response) {
    return context;
  }

  let previousElement = null;
  for (let i = context.matches.length - 1; i >= 0; i--) {
    const match = context.matches[i];
    previousElement = React.createElement(
      (match.route as any).Component as any,
      {
        head: (
          <>
            <script
              dangerouslySetInnerHTML={{
                __html:
                  "var __remix = { e: new TextEncoder() };" +
                  "__remix.rscResponse = new Response(new ReadableStream({ start(c) { __remix.c = c; } }));",
              }}
            />
            {browserManifest.chunks.map((chunk) => (
              <link key={chunk} rel="modulepreload" href={chunk} />
            ))}
            <script async type="module" src={browserManifest.entry} />
          </>
        ),
        outlet: previousElement,
        params: match.params,
        data: context.loaderData[match.route.id],
      }
    );
  }

  let status = 200;

  const body = await RSDWServer.renderToReadableStream(
    previousElement,
    manifest,
    {
      onError(reason: unknown) {
        status = 500;
        console.error(reason);
      },
    }
  );

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/x-component",
    },
  });
}
