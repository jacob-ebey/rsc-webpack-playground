import * as path from "node:path";

import type Webpack from "webpack";
import webpack from "webpack";
import nodeExternals from "webpack-node-externals";

import { WebpackRSCPlugin } from "./rsc-client-plugin.js";

const clientFileName = path.resolve(process.cwd(), "app/entry.server.tsx");

interface WebpackServerConfigOptions {
  additionalModuleDirs?: string[];
  bundleNodeModules?: boolean;
  clientModulesCache: Map<
    string,
    { id: string | number; theExports: Set<string> }
  >;
  conditions?: string[];
  mainFields?: string[];
  mode: "development" | "production";
  outputDirectory: string;
  target?: string;
}

export function createWebpackServerConfig({
  additionalModuleDirs,
  bundleNodeModules,
  clientModulesCache,
  conditions,
  mainFields,
  mode,
  outputDirectory,
  target,
}: WebpackServerConfigOptions): Webpack.Configuration {
  const entry = {
    "entry.server": path.resolve(process.cwd(), "app/entry.server"),
  };

  return {
    entry,
    mode,
    devtool: "source-map",
    target: [target || "node18", "es2020"],
    externalsPresets: { node: true },
    externals: bundleNodeModules
      ? []
      : [
          nodeExternals({
            // TODO: Resolve proper node_modules folders up to workspace root
            additionalModuleDirs,
            // @ts-expect-error
            importType: "module",
          }),
        ],
    experiments: {
      outputModule: true,
    },
    externalsType: "module",
    output: {
      filename: "[name].js",
      chunkFilename: "[name].js",
      library: { type: "module" },
      chunkFormat: "module",
      chunkLoading: "import",
      module: true,
      path: outputDirectory,
    },
    resolve: {
      mainFields: mainFields || ["main"],
      conditionNames: conditions || ["import", "node", "require", "default"],
      extensions: [".ts", ".tsx", "..."],
      symlinks: true,
    },
    optimization: {
      chunkIds: "deterministic",
      runtimeChunk: "single",
      concatenateModules: true,
      splitChunks: {
        chunks: "all",
        minSize: 0,
        maxSize: 250000,
        maxAsyncRequests: bundleNodeModules ? 1 : 30,
        maxInitialRequests: bundleNodeModules ? 1 : 30,
      },
    },
    module: {
      rules: [
        {
          test: /\.m?js$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: "esbuild-loader",
            options: {
              loader: "js",
              target: "es2020",
            },
          },
        },
        {
          test: /\.jsx$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: "esbuild-loader",
            options: {
              loader: "jsx",
              target: "es2020",
            },
          },
        },
        {
          test: /\.m?ts$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: "esbuild-loader",
            options: {
              loader: "ts",
              target: "es2020",
            },
          },
        },
        {
          test: /\.m?tsx$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: "esbuild-loader",
            options: {
              loader: "tsx",
              target: "es2020",
            },
          },
        },
      ],
    },
    plugins: [
      new WebpackRSCPlugin(clientModulesCache, clientFileName),
      bundleNodeModules
        ? new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 2,
          })
        : null,
      // {
      //   apply(compiler) {
      //     compiler.hooks.thisCompilation.tap("ConcatPlugin", (compilation) => {
      //       compilation.hooks.optimizeChunks.tap("ConcatPlugin", (chunks) => {
      //         let lastChunk: Webpack.Chunk | undefined;
      //         for (const chunk of chunks) {
      //           if (!lastChunk) {
      //             lastChunk = chunk;
      //           } else {
      //             for (const group of chunk.groupsIterable) {
      //               lastChunk.addGroup(group);
      //             }
      //           }
      //         }
      //       });
      //     });
      //   },
      // },
    ].filter(Boolean) as any[],
  };
}
