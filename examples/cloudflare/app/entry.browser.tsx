import * as React from "react";
import * as ReactDOM from "react-dom/client";
// @ts-expect-error
import ReactDOMRSC from "react-server-dom-webpack/client";

const rscChunk = ReactDOMRSC.createFromFetch(
  // @ts-expect-error
  Promise.resolve(__remix.rscResponse)
);

React.startTransition(() => {
  ReactDOM.hydrateRoot(
    document,
    <React.StrictMode>
      <RSC rscChunk={rscChunk} />
    </React.StrictMode>
  );
});

function RSC({ rscChunk }: { rscChunk: React.Usable<React.ReactElement> }) {
  return React.use(rscChunk);
}
