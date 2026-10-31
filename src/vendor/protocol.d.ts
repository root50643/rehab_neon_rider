export const UUID: Record<'service' | 'state' | 'event' | 'command' | 'response' | 'info', string>;
export const CHANNEL: Record<keyof typeof UUID, number>;
export const MAX_JSON: number, MAX_COMMAND: number, HEADER: number;
export function bytes(value: ArrayBuffer | ArrayBufferView): Uint8Array;
export function encodeJson(value: unknown): Uint8Array;
export function decodeJson(value: ArrayBuffer | ArrayBufferView | string): any;
export function chunkPayload(payload: ArrayBuffer | ArrayBufferView, capacity?: number, messageId?: number, channel?: number): Uint8Array[];
export class FrameReassembler { constructor(channel: number, maxBytes?: number); reset(): void; push(value: ArrayBuffer | ArrayBufferView, now?: number): Uint8Array | null }
export function command(cmd: string, id: number, fields?: Record<string, unknown>): { v: number; id: number; cmd: string };
export function sample(value: unknown, age: number, receivedAt: number, ttl: number, now?: number): string;
