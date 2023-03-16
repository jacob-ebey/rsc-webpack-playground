import * as path from "node:path";

import type Webpack from "webpack";
import nodeExternals from "webpack-node-externals";

import { WebpackRSCPlugin } from "./rsc-server-plugin.js";

interface WebpackRSCConfigOptions {
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

export function createWebpackRSCConfig({
  additionalModuleDirs,
  bundleNodeModules,
  clientModulesCache,
  conditions,
  mainFields,
  mode,
  outputDirectory,
  target,
}: WebpackRSCConfigOptions): Webpack.Configuration {
  const entry = {
    "entry.rsc": path.resolve(process.cwd(), "app/entry.rsc"),
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
      mainFields: mainFields || [],
      conditionNames: conditions || [],
      extensions: [".ts", ".tsx", "..."],
      symlinks: true,
    },
    optimization: {
      chunkIds: "deterministic",
      runtimeChunk: "single",
      splitChunks: {
        chunks: "all",
        minSize: 0,
        maxSize: 250000,
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
    plugins: [new WebpackRSCPlugin(clientModulesCache)],
  };
}
