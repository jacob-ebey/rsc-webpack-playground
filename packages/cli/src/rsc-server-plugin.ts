import type Webpack from "webpack";

export class WebpackRSCPlugin {
  static NAME = "WebpackRSCPlugin";

  constructor(
    private clientModulesCache: Map<
      string,
      { id: string | number; theExports: Set<string> }
    >
  ) {}

  apply(compiler: Webpack.Compiler) {
    const { Dependency, NormalModule, RuntimeGlobals, Template } =
      compiler.webpack;
    const clientModulesCache = this.clientModulesCache;

    compiler.hooks.thisCompilation.tap(
      WebpackRSCPlugin.NAME,
      (compilation, { normalModuleFactory }) => {
        compilation.dependencyTemplates.set(
          ClientReferenceDependency,
          new ClientReferenceTemplate()
        );

        compilation.hooks.optimizeModules.tap(
          WebpackRSCPlugin.NAME,
          (modules) => {
            for (const mod of modules) {
              if (!(mod instanceof NormalModule)) {
                continue;
              }
              if (clientModulesCache.has(mod.resource)) {
                let clientDep: ClientReferenceDependency;
                for (let i = mod.dependencies.length - 1; i >= 0; i--) {
                  const dep = mod.dependencies[i];
                  if (dep instanceof ClientReferenceDependency) {
                    clientDep = dep;
                    continue;
                  }
                }
                mod.clearDependenciesAndBlocks();
                mod.addDependency(clientDep!);
              }
            }
          }
        );

        const onNormalModuleFactoryParser = (
          parser: Webpack.javascript.JavascriptParser
        ) => {
          parser.hooks.program.tap(WebpackRSCPlugin.NAME, (program) => {
            const isClientModule = program.body.some((node) => {
              return (
                node.type === "ExpressionStatement" &&
                node.expression.type === "Literal" &&
                node.expression.value === "use client"
              );
            });
            if (isClientModule) {
              clientModulesCache.set(parser.state.module.resource, {} as any);

              const theExports = new Set<string>();
              for (const node of program.body) {
                if (node.type === "ExportAllDeclaration") {
                  throw new Error(
                    "ExportAllDeclaration not supported in client modules"
                  );
                }
                if (node.type === "ExportDefaultDeclaration") {
                  throw new Error("ExportDefaultDeclaration not supported");
                }
                if (node.type === "ExportNamedDeclaration") {
                  if (node.specifiers) {
                    for (const specifier of node.specifiers) {
                      if (specifier.type !== "ExportSpecifier") {
                        throw new Error("Named export must have an identifier");
                      }
                      if (specifier.exported.type !== "Identifier") {
                        throw new Error("Named export must have an identifier");
                      }
                      theExports.add(specifier.exported.name);
                    }
                    continue;
                  }
                  if (node.declaration) {
                    if (
                      node.declaration.type === "ClassDeclaration" ||
                      node.declaration.type === "FunctionDeclaration"
                    ) {
                      if (!node.declaration.id) {
                        throw new Error("Named export must have an identifier");
                      }
                      theExports.add(node.declaration.id.name);
                      continue;
                    }
                    if (node.declaration.type === "VariableDeclaration") {
                      for (const declaration of node.declaration.declarations) {
                        if (!declaration.id) {
                          throw new Error(
                            "Named export must have an identifier"
                          );
                        }
                        switch (declaration.id.type) {
                          case "Identifier":
                            theExports.add(declaration.id.name);
                            break;
                          case "ObjectPattern":
                            for (const property of declaration.id.properties) {
                              if (property.type !== "Property") {
                                throw new Error(
                                  "Named export must have an identifier"
                                );
                              }
                              if (property.key.type !== "Identifier") {
                                throw new Error(
                                  "Named export must have an identifier"
                                );
                              }
                              theExports.add(property.key.name);
                            }
                            break;
                          default:
                            throw new Error(
                              "Named export must have an identifier"
                            );
                        }
                      }
                      continue;
                    }
                  }
                }
              }

              parser.state.module.addDependency(
                new ClientReferenceDependency(theExports, parser.state.module)
              );
            }
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

    class ClientReferenceDependency extends Dependency {
      constructor(
        public theExports: Set<string>,
        public normalModule: Webpack.NormalModule
      ) {
        super();
      }

      get type(): string {
        return "client-reference";
      }
    }

    class ClientReferenceTemplate extends Template {
      apply(
        dep: ClientReferenceDependency,
        source: Webpack.sources.ReplaceSource,
        {
          chunkGraph,
          moduleGraph,
          runtimeRequirements,
          runtime,
        }: {
          chunkGraph: Webpack.ChunkGraph;
          moduleGraph: Webpack.ModuleGraph;
          runtimeRequirements: any;
          runtime: any;
        }
      ) {
        runtimeRequirements.add(RuntimeGlobals.exports);
        runtimeRequirements.add(RuntimeGlobals.definePropertyGetters);
        runtimeRequirements.add(RuntimeGlobals.makeNamespaceObject);

        const id = chunkGraph.getModuleId(dep.normalModule);
        clientModulesCache.set(dep.normalModule.resource, {
          id,
          theExports: dep.theExports,
        });

        const theExports = moduleGraph.getExportsInfo(dep.normalModule);

        let newSource = Template.asString([
          `__webpack_require__.r(__webpack_exports__);`,
          "__webpack_require__.d(__webpack_exports__, {",
          Template.indent([
            ...Array.from(dep.theExports).map((exp) => {
              return `"${theExports
                .getExportInfo(exp)
                .getUsedName(exp, runtime)}": () => (${exp}),`;
            }),
          ]),
          "});",
          ...Array.from(dep.theExports).map((exp) =>
            Template.asString([
              `const ${exp} = {`,
              Template.indent([
                '$$typeof: Symbol.for("react.client.reference"),',
                `$$id: ${JSON.stringify(id + "#" + exp)},`,
              ]),
              "};",
            ])
          ),
        ]);

        source.replace(0, source.source().length, newSource);
      }
    }
  }
}
