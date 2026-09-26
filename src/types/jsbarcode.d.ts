// jsbarcode's Code 128 encoder on its own (the package's DOM renderer isn't used).
declare module 'jsbarcode/bin/barcodes/CODE128' {
  export class CODE128 {
    constructor(data: string, options: object);
    valid(): boolean;
    /** Bars and spaces as '1' and '0', one per module. */
    encode(): { data: string; text: string };
  }
}
