export type Fixup = {
  offset: number;
  target: string;
  addend: number;
  kind: "rel32" | "rva32" | "va64";
};
export interface CodeFragment {
  bytes: Uint8Array;
  fixups: Fixup[];
  symbols: Record<string, number>;
}
export type NamedFragment = CodeFragment & {
  name: string;
  section: ".text" | ".rdata" | ".data";
  alignment?: number;
};
export interface ImportSymbol {
  dll: string;
  name: string;
  symbol: string;
}
export interface SavedRegister {
  register: number;
  codeOffset: number;
  stackOffset: number;
}
export interface UnwindFunction {
  begin: string;
  end: string;
  prologSize: number;
  stackAllocation: number;
  savedRegisters: SavedRegister[];
  allocationCodeOffset?: number;
  pushedRegisters?: { register: number; codeOffset: number }[];
}
export interface NativeProgram {
  fragments: NamedFragment[];
  imports: ImportSymbol[];
  entry: string;
  functions: UnwindFunction[];
}
