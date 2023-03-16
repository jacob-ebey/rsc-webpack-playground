import { type AgnosticDataRouteObject } from "@remix-run/router";

import * as root from "./root";
import * as index from "./routes/_index";
import * as about from "./routes/about";

export const routes: AgnosticDataRouteObject[] = [
  {
    id: "root",
    path: "/",
    ...root,
    children: [
      {
        id: "index",
        index: true,
        ...index,
      },
      {
        id: "about",
        path: "about",
        ...about,
      },
    ],
  },
];
