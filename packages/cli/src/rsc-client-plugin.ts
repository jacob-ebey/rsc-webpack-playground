import type Webpack from "webpack";

export class WebpackRSCPlugin {
  static NAME = "WebpackRSCPlugin";

  constructor(
    private clientModulesCache: Map<
      string,
      { id: string | number; theExports: Set<string> }
    >,
    private clientFileName: string
  ) {}

  apply(compiler: Webpack.Compiler) {
    const clientModulesCache = this.clientModulesCache;
    const clientFileName = this.clientFileName;
    let foundClientFile = false;
    const {
      AsyncDependenciesBlock,
      RuntimeGlobals,
      dependencies: { ModuleDependency, NullDependency },
    } = compiler.webpack;

    class ClientReferenceDependency extends ModuleDependency {
      constructor(request: string) {
        super(request);
      }

      get type(): string {
        return "client-reference";
      }
    }

    compiler.hooks.thisCompilation.tap(
      WebpackRSCPlugin.NAME,
      (compilation, { normalModuleFactory }) => {
        compilation.dependencyFactories.set(
          ClientReferenceDependency,
          normalModuleFactory
        );
        compilation.dependencyTemplates.set(
          ClientReferenceDependency,
          new NullDependency.Template()
        );

        compilation.hooks.optimizeModules.tap(WebpackRSCPlugin.NAME, () => {
          if (!foundClientFile) {
            throw new Error(
              `Could not find client file. Did you forget to import "react-server-dom-webpack/client"?`
            );
          }
        });

        compilation.hooks.additionalTreeRuntimeRequirements.tap(
          WebpackRSCPlugin.NAME,
          (chunk, runtimeRequirements) => {
            runtimeRequirements.add(RuntimeGlobals.ensureChunk);
            runtimeRequirements.add(RuntimeGlobals.compatGetDefaultExport);
          }
        );

        const onNormalModuleFactoryParser = (
          parser: Webpack.javascript.JavascriptParser
        ) => {
          parser.hooks.program.tap(WebpackRSCPlugin.NAME, () => {
            if (parser.state.module.resource !== clientFileName) {
              return;
            }

            for (const clientModule of clientModulesCache) {
              const [file, { id }] = clientModule;
              const block = new AsyncDependenciesBlock(
                {
                  name: String(id),
                },
                undefined,
                file
              );
              block.addDependency(new ClientReferenceDependency(file));
              parser.state.module.addBlock(block);
            }

            foundClientFile = true;
          });
        };

        normalModuleFactory.hooks.parser
          .for("javascript/auto")
          .tap("HarmonyModulesPlugin", onNormalModuleFactoryParser);

        normalModuleFactory.hooks.parser
          .for("javascript/dynamic")
          .tap("HarmonyModulesPlugin", onNormalModuleFactoryParser);

        normalModuleFactory.hooks.parser
          .for("javascript/esm")
          .tap("HarmonyModulesPlugin", onNormalModuleFactoryParser);
      }
    );
  }
}
