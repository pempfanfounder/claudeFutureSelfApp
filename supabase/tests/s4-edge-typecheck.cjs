// Checks owned Edge TypeScript offline. External Deno/Supabase declarations are
// structural fixtures, NOT proof against a deployed SDK/runtime.
const ts = require("typescript");
const path = require("path");
const root = path.resolve(__dirname, "..", "functions");
const virtual = path.join(__dirname, "s4-runtime-fixture.d.ts");
const declarations = `declare const Deno: { env: { get(name:string):string|undefined }; serve(handler:(request:Request)=>Response|Promise<Response>):void };
declare module 'npm:@supabase/supabase-js@2' { export type SupabaseClient=any; export interface User { id:string }; export function createClient(...args:any[]):any; }`;
const options = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  skipLibCheck: true,
  types: [],
};
const host = ts.createCompilerHost(options);
const oldRead = host.readFile.bind(host),
  oldExists = host.fileExists.bind(host);
host.readFile = (f) => (f === virtual ? declarations : oldRead(f));
host.fileExists = (f) => f === virtual || oldExists(f);
const program = ts.createProgram(
  [
    virtual,
    path.join(root, "revenuecat-webhook/index.ts"),
    path.join(root, "sync-entitlement/index.ts"),
  ],
  options,
  host,
);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
  process.exitCode = 1;
} else
  console.log(
    "Owned Edge TypeScript: no diagnostics (external runtime declarations mocked; no Deno/provider/DB integration).",
  );
