import { type Params } from "@remix-run/router";
import * as React from "react";

import { Counter } from "./components/counter";

export async function Component({
  head,
  outlet,
}: {
  head: React.ReactNode;
  outlet: React.ReactNode;
  params: Params;
  data: unknown;
}) {
  return (
    <html>
      <head>
        <title>Basic Example</title>
        {head}
      </head>
      <body>
        <h1>Root Route</h1>
        <p>
          <a href="/">Home</a> | <a href="/about">About</a>
        </p>
        <Counter label="A" />

        <React.Suspense fallback={<p>Loading...</p>}>{outlet}</React.Suspense>
      </body>
    </html>
  );
}
