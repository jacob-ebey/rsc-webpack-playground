#!/usr/bin/env node

import("../dist/index.js")
  .then((mod) => mod.run(process.argv.slice(2)))
  .catch((reason) => {
    console.error(reason);
    process.exit(1);
  });
