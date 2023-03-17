import * as stream from "node:stream";
import { parentPort } from "node:worker_threads";

import { createStaticHandler } from "@remix-run/router";
import * as React from "react";
// @ts-expect-error
import RSDWServer from "react-server-dom-webpack/server";

import { routes } from "./config";

async function handleRequest(
  request: Request,
  manifest: unknown,
  browserManifest: { entry: string; chunks: string[] }
): Promise<Response> {
  const staticHandler = createStaticHandler(routes);

  const url = new URL(request.url);
  const actionId = url.searchParams.get("_rsc_action");
  const queryRequest = actionId
    ? new Request(url, {
        method: "GET",
        headers: request.headers,
        signal: request.signal,
      })
    : request;

  if (actionId) {
    const [modId, fnName] = actionId.split("#", 2);
    // @ts-expect-error
    const mod = __webpack_require__(modId);
    const fn = mod[fnName];
    if (typeof fn !== "function") {
      throw new Error(`Could not find function ${fnName} in module ${modId}`);
    }

    await fn(request);
  }

  const context = await staticHandler.query(queryRequest);
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
  const passthrough = new stream.PassThrough();

  RSDWServer.renderToPipeableStream(previousElement, manifest, {
    onError(reason: unknown) {
      status = 500;
      console.error(reason);
    },
  }).pipe(passthrough);

  return new Response(stream.Readable.toWeb(passthrough) as any, {
    status,
    headers: {
      "Content-Type": "text/x-component",
    },
  });
}

interface Opts {
  headers: [string, string][];
  manifest: unknown;
  browserManifest: unknown;
  method: string;
  fullURL: string;
}

export default async function run(opts: Opts) {
  const duplex = new stream.PassThrough();

  (async () => {
    const request = createRequest(opts, duplex);
    const response = await handleRequest(
      request,
      opts.manifest,
      opts.browserManifest as any
    );

    await sendResponse(response);
  })()
    .catch((err) => {
      console.error(err);
    })
    .then(() => {
      duplex.end();
    });
  return duplex;
}

function createRequest(opts: Opts, duplex: stream.Duplex) {
  return new Request(opts.fullURL, {
    body:
      opts.method !== "GET" && opts.method !== "HEAD" ? (duplex as any) : null,
    headers: opts.headers,
    method: opts.method,
    duplex: "half",
  } as any);
}

async function sendResponse(response: Response) {
  parentPort!.postMessage({
    code: "EVENT",
    name: "status",
    args: [response.status],
  });
  const responseHeaders: Record<string, string[]> = {};
  for (const [key, value] of response.headers) {
    const values = responseHeaders[key] ?? [];
    values.push(value);
    responseHeaders[key] = values;
  }
  parentPort!.postMessage({
    code: "EVENT",
    name: "headers",
    args: [responseHeaders],
  });

  parentPort!.postMessage({
    code: "EVENT",
    name: "body",
    args: [!!response.body],
  });

  if (response.body) {
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let { done, value } = await reader.read();
    while (!done) {
      parentPort!.postMessage({
        code: "EVENT",
        name: "data",
        args: [decoder.decode(value, { stream: true })],
      });
      ({ done, value } = await reader.read());
    }
    parentPort!.postMessage({
      code: "EVENT",
      name: "data",
      args: [decoder.decode(), true],
    });
  }
}
