import * as events from "node:events";
import * as stream from "node:stream";

import express from "express";
import isbot from "isbot";
import * as React from "react";
import * as ReactServer from "react-dom/server";
// @ts-expect-error
import * as ReactRSC from "react-server-dom-webpack/client";
import ThreadStream from "thread-stream";

isbot.exclude(["chrome-lighthouse"]);

export function createApp(
  workerPath: string,
  rscManifest: unknown,
  serverManifest: unknown,
  browserManifest: unknown
) {
  const app = express();

  app.all("*", async (req, res, next) => {
    try {
      const fullURL = req.protocol + "://" + req.get("host") + req.originalUrl;
      const url = new URL(fullURL);

      const rscResponse = await callRSCWorker(
        workerPath,
        rscManifest,
        browserManifest,
        fullURL,
        req
      );

      if (isRedirectResponse(rscResponse) || url.searchParams.has("_rsc")) {
        await sendWebResponse(res, rscResponse);
        return;
      }

      const rscReadable = stream.Readable.fromWeb(rscResponse.body as any);
      const rscChunk = ReactRSC.createFromNodeStream(
        rscReadable,
        serverManifest
      );
      const rscTransform = new RSCTransform(rscReadable);

      const isBot = isbot(req.headers["user-agent"] || "");
      let didError = false;
      const ssrStream = ReactServer.renderToPipeableStream(
        <RSC rscChunk={rscChunk} />,
        {
          // If the request is from a bot, wait for everything to be ready
          onAllReady() {
            if (isBot) {
              res.writeHead(didError ? 500 : 200, {
                "Content-Type": "text/html",
              });
              // Pipe the RSC transform stream to the response
              rscTransform.pipe(res, { end: true });
              // Pipe the SSR stream to the RSC transform stream
              ssrStream.pipe(rscTransform);
            }
          },
          // If the request is from a browser, wait for the shell to be ready
          onShellReady() {
            if (!isBot) {
              res.writeHead(didError ? 500 : 200, {
                "Content-Type": "text/html",
              });
              rscTransform.on("data", () => {
                (res as any).flush();
              });
              // Pipe the RSC transform stream to the response
              rscTransform.pipe(res, { end: true });
              // Pipe the SSR stream to the RSC transform stream
              ssrStream.pipe(rscTransform);
            }
          },
          onShellError() {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/html");
            res.end(`<h1>Something went wrong</h1>`);
          },
          onError(error) {
            didError = true;
            console.error(error);
          },
        }
      );
    } catch (reason) {
      next(reason);
    }
  });

  return app;
}

function RSC({ rscChunk }: { rscChunk: React.Usable<React.ReactElement> }) {
  return React.use(rscChunk);
}

/**
 * @param {express.Response} res
 * @param {Response} response
 */
async function sendWebResponse(res: express.Response, response: Response) {
  const responseHeaders: Record<string, string[]> = {};
  for (const [key, value] of response.headers) {
    const values = responseHeaders[key] ?? [];
    values.push(value);
    responseHeaders[key] = values;
  }

  res.writeHead(response.status, response.statusText, responseHeaders);

  if (response.body) {
    const reader = response.body.getReader();
    let { done, value } = await reader.read();
    let flushable = res as { flush?: Function };
    while (!done) {
      res.write(value);
      if (typeof flushable.flush === "function") {
        flushable.flush();
      }
      ({ done, value } = await reader.read());
    }
  }
  res.end();
}

async function callRSCWorker(
  workerPath: string,
  manifest: unknown,
  browserManifest: unknown,
  fullURL: string,
  req: express.Request
) {
  /** @type {[string, string][]} */
  const headers = [];
  for (const [key, header] of Object.entries(req.headers)) {
    if (Array.isArray(header)) {
      for (const value of header) {
        headers.push([key, value]);
      }
    } else if (typeof header === "string") {
      headers.push([key, header]);
    }
  }

  const rscStream = new ThreadStream({
    filename: workerPath,
    workerData: {
      headers,
      manifest,
      browserManifest,
      method: req.method,
      fullURL,
    },
    workerOpts: {
      execArgv: ["--conditions", "react-server"],
    },
  });

  req.on("data", (chunk) => {
    rscStream.write(chunk.toString());
  });

  return await rscStreamToResponse(rscStream);
}

async function rscStreamToResponse(rscStream: ThreadStream) {
  return await new Promise<Response>(async (resolve, reject) => {
    const statusPromise = events.once(rscStream, "status").then((r) => r[0]);
    const headersPromise = events.once(rscStream, "headers").then((r) => r[0]);
    const bodyPromise = events.once(rscStream, "body").then((r) => r[0]);

    await events.once(rscStream, "ready");

    const [status, headers, hasBody] = await Promise.all([
      statusPromise,
      headersPromise,
      bodyPromise,
    ]);

    let body: ReadableStream<Uint8Array> | undefined;
    if (hasBody) {
      const encoder = new TextEncoder();
      body = new ReadableStream<Uint8Array>({
        async start(controller) {
          rscStream.on("data", (data, done) => {
            controller.enqueue(encoder.encode(data));
            if (done) {
              controller.close();
            }
          });
          rscStream.on("error", (error) => {
            console.log(error);
            controller.error(error);
          });
        },
      });
    }

    resolve(
      new Response(body, {
        status,
        headers,
      })
    );
  });
}

/**
 * A transform stream that takes RSC chunks and injects them into the HTML
 * stream for use during hydration.
 */
class RSCTransform extends stream.Transform {
  private rscChunks: string[];
  constructor(rscStream: stream.Readable) {
    super();

    this.rscChunks = [];
    rscStream.on("data", (chunk) => {
      const rscData = chunk.toString();
      this.rscChunks.push(
        `<script>__remix.c.enqueue(__remix.e.encode(${JSON.stringify(
          rscData
        )}));</script>`
      );
    });
  }

  // @ts-ignore
  _transform(chunk, encoding, callback) {
    callback(null, chunk);
    for (const rscChunk of this.rscChunks) {
      this.push(rscChunk, "utf8");
    }
    this.rscChunks = [];
  }
}

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
export function isRedirectStatusCode(statusCode: number): boolean {
  return redirectStatusCodes.has(statusCode);
}
export function isRedirectResponse(response: Response): boolean {
  return isRedirectStatusCode(response.status);
}
