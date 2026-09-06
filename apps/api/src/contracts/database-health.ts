export interface DatabaseHealth {
  ping(): Promise<void>;
  close(): Promise<void>;
}
