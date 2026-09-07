import type { ColombianLocality } from './locality-import.js';

export type LocalityListInput = Readonly<{
  query?: string;
  department?: string;
  afterCode?: string;
  limit: number;
}>;

export type LocalityPage = Readonly<{
  items: readonly ColombianLocality[];
  nextAfterCode: string | null;
}>;

export interface LocalityRepository {
  replaceAll(
    input: Readonly<{
      localities: readonly ColombianLocality[];
      sourceSha256: string;
    }>,
  ): Promise<Readonly<{ imported: number; unchanged: boolean }>>;
  list(input: LocalityListInput): Promise<LocalityPage>;
}
