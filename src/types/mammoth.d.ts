/**
 * Minimal type shim for mammoth's browser entry. The package ships JS-only
 * for the browser build; the @types/mammoth package mirrors the node entry
 * which excludes `mammoth.browser`.
 */
declare module "mammoth/mammoth.browser" {
  export interface ConvertToHtmlOptions {
    arrayBuffer?: ArrayBuffer;
    buffer?: Uint8Array;
  }
  export interface ConvertToHtmlResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(
    input: ConvertToHtmlOptions,
  ): Promise<ConvertToHtmlResult>;
}
