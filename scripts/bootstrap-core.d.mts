export declare const SCAFFOLD_ALLOWLIST: readonly string[]

export declare class BootstrapSafetyError extends Error {
  constructor(message: string)
}

export interface BootstrapOptions {
  root?: string
  cwd?: string
  staging?: string
  runScaffold?: boolean
}

export interface BootstrapResult {
  root: string
  staging: string
  copiedEntries: string[]
  bootstrapScriptAdded: boolean
  repository: 'existing' | 'initialized'
}

export declare function bootstrapCore(
  options?: BootstrapOptions,
): Promise<BootstrapResult>
