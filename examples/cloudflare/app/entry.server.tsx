import isbot from "isbot";
import * as React from "react";
import * as ReactServer from "react-dom/server";
// @ts-expect-error
import * as ReactRSC from "react-server-dom-webpack/client.edge";

isbot.exclude(["chrome-lighthouse"]);

export async function handleRequest(
  request: Request,
  rscResponse: Response,
  serverManifest: unknown
): Promise<Response> {
  const url = new URL(request.url);

  if (isRedirectResponse(rscResponse) || url.searchParams.has("_rsc")) {
    return rscResponse;
  }

  if (!rscResponse.body) {
    throw new Error("RSC response has no body");
  }

  const rscTeed = rscResponse.body.tee();

  const rscChunk = ReactRSC.createFromFetch(
    Promise.resolve(new Response(rscTeed[0], rscResponse)),
    serverManifest
  );
  const rscTransform = new RSCTransform(rscTeed[1]);

  let didError = false;
  const body = await ReactServer.renderToReadableStream(
    <RSC rscChunk={rscChunk} />,
    {
      onError(error) {
        didError = true;
        console.error(error);
      },
    }
  );

  if (isbot(request.headers.get("User-Agent") || "")) {
    await body.allReady;
  }

  body.pipeTo(rscTransform.writable);
  return new Response(rscTransform.readable, {
    status: didError ? 500 : 200,
    headers: {
      "Content-Type": "text/html",
    },
  });
}

function RSC({ rscChunk }: { rscChunk: React.Usable<React.ReactElement> }) {
  return React.use(rscChunk);
}

class RSCTransform extends TransformStream {
  constructor(rscStream: ReadableStream<Uint8Array>) {
    let rscChunks: Uint8Array[] = [];
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    const enqueueScript = (rscData: string) => {
      rscChunks.push(
        encoder.encode(
          `<script>__remix.c.enqueue(__remix.e.encode(${JSON.stringify(
            rscData
          )}));</script>`
        )
      );
    };

    super({
      async start() {
        const reader = rscStream.getReader();
        let { done, value } = await reader.read();
        while (!done) {
          enqueueScript(decoder.decode(value, { stream: true }));
          ({ done, value } = await reader.read());
        }
        enqueueScript(decoder.decode());
      },
      flush(controller) {
        for (const rscChunk of rscChunks) {
          controller.enqueue(rscChunk);
        }
        rscChunks = [];
      },
    });
  }
}

const redirectStatusCodes = new Set([301, 302, 303, 307, 308]);
export function isRedirectStatusCode(statusCode: number): boolean {
  return redirectStatusCodes.has(statusCode);
}
export function isRedirectResponse(response: Response): boolean {
  return isRedirectStatusCode(response.status);
}
