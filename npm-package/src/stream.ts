import type { Publisher } from "./publisher";

/**
 * Represents an active data stream. Created via `Publisher.createStream()`
 * or `EchoBus.createStream()`.
 */
export class Stream {
  private _sequence = 0;
  private _ended = false;
  private _started = false;

  constructor(
    /** Unique stream identifier */
    public readonly id: string,
    private readonly _topic: string,
    private readonly _metadata: any | undefined,
    private readonly _publisher: Publisher
  ) {
    this._start();
  }

  /** Write a data chunk to the stream */
  write(payload: any): void {
    if (this._ended) throw new Error("Stream has already ended");
    this._publisher._sendStreamData(this.id, payload, this._sequence++);
  }

  /** End the stream */
  end(): void {
    if (this._ended) return;
    this._ended = true;
    this._publisher._sendStreamEnd(this.id);
  }

  /** Whether this stream has ended */
  get ended(): boolean {
    return this._ended;
  }

  /** Current sequence number (next chunk will use this value) */
  get sequence(): number {
    return this._sequence;
  }

  private _start(): void {
    if (this._started) return;
    this._started = true;
    this._publisher._sendStreamStart(this.id, this._topic, this._metadata);
  }
}
