declare module 'alea' {
  export interface AleaRandom {
    (): number;
    uint32(): number;
    fract53(): number;
    version: string;
    args: unknown[];
  }

  export default function alea(seed?: string | number): AleaRandom;
}
