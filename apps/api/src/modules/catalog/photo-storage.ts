export type StoredPhoto = Readonly<{
  storageKey: string;
  mimeType: 'image/jpeg' | 'image/png';
  byteSize: number;
  sha256: string;
}>;

export interface PhotoStorage {
  save(bytes: Uint8Array): Promise<StoredPhoto>;
  read(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}
