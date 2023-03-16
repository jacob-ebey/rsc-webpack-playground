import * as nodeModule from "node:module";
import * as path from "node:path";

// import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";
import type Webpack from "webpack";
import webpack from "webpack";
const { DefinePlugin } = webpack;

import { WebpackRSCPlugin } from "./rsc-client-plugin.js";

const require = nodeModule.createRequire(import.meta.url);
const clientFileName = require.resolve(
  "react-server-dom-webpack/client.browser"
);

interface WebpackBrowserConfigOptions {
  clientModulesCache: Map<
    string,
    { id: string | number; theExports: Set<string> }
  >;
  mode: "development" | "production";
  outputDirectory: string;
  publicPath: string;
}

export function createWebpackBrowserConfig({
  clientModulesCache,
  mode,
  outputDirectory,
  publicPath,
}: WebpackBrowserConfigOptions): Webpack.Configuration {
  const entry = {
    "entry.browser": path.resolve(process.cwd(), "app/entry.browser"),
  };
  return {
    entry,
    mode,
    devtool: "source-map",
    target: ["web", "es2020"],
    experiments: {
      outputModule: true,
    },
    externalsType: "module",
    output: {
      filename: "[name]-[contenthash].js",
      chunkFilename: "[name]-[contenthash].js",
      hotUpdateMainFilename: "hot-[runtime]-[fullhash].js",
      hotUpdateChunkFilename: "hot-[runtime]-[id]-[fullhash].js",
      library: { type: "module" },
      chunkFormat: "module",
      chunkLoading: "import",
      module: true,
      path: outputDirectory,
      publicPath,
    },
    resolve: {
      mainFields: ["browser", "module", "main"],
      conditionNames: ["browser", "module", "main"],
      extensions: [".ts", ".tsx", "..."],
      symlinks: true,
    },
    optimization: {
      chunkIds: "deterministic",
      runtimeChunk: "single",
      minimize: mode !== "development",
      splitChunks: {
        chunks: "all",
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
      new DefinePlugin({
        "process.env.NODE_ENV": JSON.stringify(mode),
      }),
      new WebpackRSCPlugin(clientModulesCache, clientFileName),
      // new BundleAnalyzerPlugin(),
    ],
  };
}
