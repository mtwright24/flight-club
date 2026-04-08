/**
 * pdfjs-dist legacy bundle touches browser globals at module load. Supabase Edge (Deno)
 * has no DOMMatrix / Path2D / ImageData — register minimal stubs before importing pdfjs.
 */
const g = globalThis as typeof globalThis & {
  DOMMatrix?: typeof DOMMatrix;
  Path2D?: typeof Path2D;
  ImageData?: typeof ImageData;
};

if (typeof g.DOMMatrix === 'undefined') {
  g.DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    m11 = 1;
    m12 = 0;
    m21 = 0;
    m22 = 1;
    m41 = 0;
    m42 = 0;
    is2D = true;
    isIdentity = true;
    constructor(_init?: string | number[]) {
      /* text extraction does not need real transforms */
    }
    multiplySelf(): DOMMatrix {
      return this as unknown as DOMMatrix;
    }
    invertSelf(): DOMMatrix {
      return this as unknown as DOMMatrix;
    }
    translateSelf(): DOMMatrix {
      return this as unknown as DOMMatrix;
    }
    scaleSelf(): DOMMatrix {
      return this as unknown as DOMMatrix;
    }
    rotateSelf(): DOMMatrix {
      return this as unknown as DOMMatrix;
    }
    static fromMatrix(): DOMMatrix {
      return new g.DOMMatrix!();
    }
  } as unknown as typeof DOMMatrix;
}

if (typeof g.Path2D === 'undefined') {
  g.Path2D = class Path2D {
    constructor(_path?: Path2D | string) {
      /* stub */
    }
  } as unknown as typeof Path2D;
}

if (typeof g.ImageData === 'undefined') {
  g.ImageData = class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(swOrData: number | Uint8ClampedArray, sh?: number, sh2?: number) {
      if (typeof swOrData === 'number') {
        this.width = swOrData;
        this.height = sh ?? 0;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = swOrData;
        this.width = sh ?? 0;
        this.height = sh2 ?? 0;
      }
    }
  } as unknown as typeof ImageData;
}
