import * as fs from "node:fs";
import * as path from "node:path";
import * as cp from "node:child_process";

import arg from "arg";
import chokidar from "chokidar";
import webpack from "webpack";

import { createWebpackBrowserConfig } from "./webpack-browser-config.js";
import { createWebpackRSCConfig } from "./webpack-rsc-config.js";
import { createWebpackServerConfig } from "./webpack-server-config.js";

export async function run(argv: string[]) {
  const args = arg(
    {
      "--mode": String,
      "--publicPath": String,
    },
    { argv }
  );
  const command = args._[0];
  const publicPath = args["--publicPath"] || "/build/";

  switch (command) {
    case "build":
      await build(
        args["--mode"] === "development" ? "development" : "production",
        publicPath
      );
      break;
    case "dev":
      const devCommandPosition = argv.findIndex((arg) => arg === "--");
      const devCommand =
        devCommandPosition === -1 ? null : argv.slice(devCommandPosition + 1);

      await dev(
        args["--mode"] === "production" ? "production" : "development",
        publicPath,
        devCommand
      );
  }
}

let rscCompiler: webpack.Compiler,
  browserCompiler: webpack.Compiler,
  serverCompiler: webpack.Compiler,
  clientModulesCache: Map<
    string,
    { id: string | number; theExports: Set<string> }
  >;

async function build(
  mode: "development" | "production",
  publicPath: string,
  inputFile?: (file: string) => void
) {
  const start = process.hrtime();
  if (clientModulesCache && rscCompiler && browserCompiler && serverCompiler) {
    const rscStats = await new Promise<webpack.Stats | undefined>(
      (resolve, reject) => {
        rscCompiler.run((error, stats) => {
          if (error) reject(error);
          else resolve(stats);
        });
      }
    );

    if (!rscStats || rscStats.hasErrors()) {
      console.log(
        rscStats?.toString({
          colors: true,
          modules: false,
          children: false,
          chunks: false,
          chunkModules: false,
        })
      );
      throw new Error("Failed to build RSC");
    }

    const browserStats = await new Promise<webpack.Stats | undefined>(
      (resolve, reject) => {
        browserCompiler.run((error, stats) => {
          if (error) reject(error);
          else resolve(stats);
        });
      }
    );

    if (!browserStats || browserStats.hasErrors()) {
      console.log(
        browserStats?.toString({
          colors: true,
          modules: false,
          children: false,
          chunks: false,
          chunkModules: false,
        })
      );
      throw new Error("Failed to build browser");
    }

    const serverStats = await new Promise<webpack.Stats | undefined>(
      (resolve, reject) => {
        serverCompiler.run((error, stats) => {
          if (error) reject(error);
          else resolve(stats);
        });
      }
    );

    if (!serverStats || serverStats.hasErrors()) {
      console.log(
        serverStats?.toString({
          colors: true,
          modules: false,
          children: false,
          chunks: false,
          chunkModules: false,
        })
      );
      throw new Error("Failed to build server");
    }

    writeManifests(clientModulesCache, browserStats, serverStats, publicPath);

    const end = process.hrtime(start);
    console.log("✅ Rebuilt in", hrtimesToReadable(start, end));
    return;
  }

  const pkgFile = path.resolve(process.cwd(), "package.json");
  const bundlerOptions =
    JSON.parse(fs.readFileSync(pkgFile, "utf8")).bundler || {};

  clientModulesCache = new Map();
  const rscConfig = createWebpackRSCConfig({
    outputDirectory: path.resolve(process.cwd(), "build"),
    ...bundlerOptions.rsc,
    clientModulesCache,
    mode,
  });
  if (inputFile) {
    rscConfig.plugins = rscConfig.plugins ?? [];
    rscConfig.plugins.push(new InputFilePlugin(inputFile));
  }

  const rscStats = await new Promise<webpack.Stats | undefined>(
    (resolve, reject) => {
      rscCompiler = webpack(rscConfig, (error, stats) => {
        if (error) reject(error);
        else resolve(stats);
      });
    }
  );

  if (!rscStats || rscStats.hasErrors()) {
    console.log(
      rscStats?.toString({
        colors: true,
        modules: false,
        children: false,
        chunks: false,
        chunkModules: false,
      })
    );
    throw new Error("Failed to build RSC");
  }

  const browserConfig = createWebpackBrowserConfig({
    clientModulesCache,
    mode,
    outputDirectory: path.resolve(process.cwd(), "public/build"),
    publicPath,
  });
  if (inputFile) {
    browserConfig.plugins = browserConfig.plugins ?? [];
    browserConfig.plugins.push(new InputFilePlugin(inputFile));
  }

  const browserStats = await new Promise<webpack.Stats | undefined>(
    (resolve, reject) => {
      browserCompiler = webpack(browserConfig, (error, stats) => {
        if (error) reject(error);
        else resolve(stats);
      });
    }
  );

  console.log(
    browserStats?.toString({
      colors: true,
      modules: false,
      children: false,
      chunks: false,
      chunkModules: false,
    })
  );

  if (!browserStats || browserStats.hasErrors()) {
    throw new Error("Failed to build browser");
  }

  const serverConfig = createWebpackServerConfig({
    outputDirectory: path.resolve(process.cwd(), "build"),
    ...bundlerOptions.ssr,
    clientModulesCache,
    mode,
  });
  if (inputFile) {
    serverConfig.plugins = serverConfig.plugins ?? [];
    serverConfig.plugins.push(new InputFilePlugin(inputFile));
  }

  const serverStats = await new Promise<webpack.Stats | undefined>(
    (resolve, reject) => {
      serverCompiler = webpack(serverConfig, (error, stats) => {
        if (error) reject(error);
        else resolve(stats);
      });
    }
  );

  if (!serverStats || serverStats.hasErrors()) {
    console.log(
      serverStats?.toString({
        colors: true,
        modules: false,
        children: false,
        chunks: false,
        chunkModules: false,
      })
    );
    throw new Error("Failed to build server");
  }

  writeManifests(clientModulesCache, browserStats, serverStats, publicPath);

  const end = process.hrtime(start);
  console.log("\n✅ Built in", hrtimesToReadable(start, end));
}

function writeManifests(
  clientModulesCache: Map<
    string,
    { id: string | number; theExports: Set<string> }
  >,
  browserStats: webpack.Stats,
  serverStats: webpack.Stats,
  publicPath: string
) {
  const manifestRSC: any = {};
  const browserInfo = browserStats.toJson();
  for (const [, { id, theExports }] of clientModulesCache) {
    const chunk = browserInfo.namedChunkGroups![id];

    for (const exp of theExports) {
      manifestRSC[String(id) + "#" + exp] = {
        id: chunk.name,
        name: exp,
        chunks: chunk.chunks,
        async: true,
      };
    }
  }

  fs.writeFileSync(
    path.resolve(process.cwd(), "build/manifest.rsc.js"),
    `export default ${JSON.stringify(manifestRSC)};
export const browserManifest = ${JSON.stringify({
      entry:
        publicPath +
        browserInfo.namedChunkGroups!["entry.browser"].assets![
          browserInfo.namedChunkGroups!["entry.browser"].assets!.length - 1
        ].name,
      chunks: browserInfo
        .namedChunkGroups!["entry.browser"].assets?.slice(0, -1)!
        .map((asset) => publicPath + asset.name),
    })};\n`,
    "utf8"
  );

  const manifestServer: any = {};
  const serverInfo = serverStats.toJson();
  for (const [, { id, theExports }] of clientModulesCache) {
    const chunk = serverInfo.namedChunkGroups![id];

    manifestServer[String(id)] = {};
    for (const exp of theExports) {
      manifestServer[String(id)][exp] = {
        id: chunk.name,
        name: exp,
        chunks: chunk.chunks,
      };
    }
  }

  fs.writeFileSync(
    path.resolve(process.cwd(), "build/manifest.server.js"),
    `export default ${JSON.stringify(manifestServer)};\n`,
    "utf8"
  );
}

let lastCompilationPromise: Promise<void>;
async function dev(
  mode: "development" | "production",
  publicPath: string,
  devCommand: string[] | null
) {
  const watcher = chokidar.watch([], {
    atomic: true,
    ignoreInitial: true,
  });
  const inputFile = (file: string) => {
    watcher.add(file);
  };

  let running = false;
  let queued = false;
  function startDevCommand() {
    if (!running && devCommand && devCommand.length > 0) {
      console.log("🚀 Running dev command");

      running = true;
      const devProcess = cp.spawn(devCommand[0], devCommand.slice(1), {
        env: {
          ...process.env,
          NODE_ENV: mode,
        },
        shell: true,
        stdio: "inherit",
      });
      devProcess.once("exit", () => {
        running = false;
      });
    }
  }

  try {
    lastCompilationPromise = build(mode, publicPath, inputFile);
    await lastCompilationPromise;
    startDevCommand();
  } catch (error) {
    console.error(error);
  }

  watcher.on("all", async () => {
    if (queued) return;
    queued = true;
    await lastCompilationPromise;
    lastCompilationPromise = build(mode, publicPath, inputFile);
    queued = false;
    await lastCompilationPromise;
    startDevCommand();
  });

  await new Promise(() => {});
}

class InputFilePlugin {
  constructor(private inputFile: (file: string) => void) {}
  apply(compiler: webpack.Compiler) {
    compiler.hooks.thisCompilation.tap(
      "InputFilePlugin",
      (compilation, { normalModuleFactory }) => {
        normalModuleFactory.hooks.module.tap("InputFilePlugin", (module) => {
          if ((module as any).resource) {
            this.inputFile((module as any).resource);
          }
          return module;
        });
      }
    );
  }
}

function hrtimesToReadable(start: [number, number], end: [number, number]) {
  const timeInMs = (end[0] * 1000000000 + end[1]) / 1000000;

  if (timeInMs < 1000) {
    return `${timeInMs.toFixed(2)}ms`;
  } else if (timeInMs < 10000) {
    return `${(timeInMs / 1000).toFixed(2)}s`;
  } else {
    const min = Math.floor(timeInMs / 1000 / 60);
    const sec = Math.floor((timeInMs / 1000) % 60);
    return `${min}m ${sec}s`;
  }
}
