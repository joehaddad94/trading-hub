declare module 'lzma-purejs' {
  /** CommonJS via amdefine, so only a default export exists under ESM. */
  const lzma: {
    /** Decompresses a whole .lzma ("LZMA alone") buffer. */
    decompressFile(input: Buffer | Uint8Array): Buffer;
  };
  export default lzma;
}
