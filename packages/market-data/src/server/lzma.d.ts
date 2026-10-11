declare module 'lzma' {
  /** LZMA-JS: decompresses an .lzma byte array; returns a string when the result is valid UTF-8. */
  export function decompress(data: Uint8Array | number[]): string | number[];
  const lzma: { decompress: typeof decompress };
  export default lzma;
}
