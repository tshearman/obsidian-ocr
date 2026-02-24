/**
 * Web Worker for CPU-intensive image preprocessing.
 *
 * Receives pixel data from the main thread via a MessageChannel port,
 * applies autoContrast + unsharpMask off the main thread, then transfers
 * the result back through the same port.
 *
 * Message shape (main → worker):
 *   { data: Uint8ClampedArray, width: number, height: number, port: MessagePort }
 *   Transfer list: [data.buffer, port]
 *
 * Reply shape (worker → main, via port):
 *   { data: Uint8ClampedArray }
 *   Transfer list: [data.buffer]
 */

import { autoContrast, unsharpMask } from "./preprocessing";

self.onmessage = (
  e: MessageEvent<{
    data: Uint8ClampedArray;
    width: number;
    height: number;
    port: MessagePort;
  }>
) => {
  const { data, width, height, port } = e.data;
  autoContrast(data);
  unsharpMask(data, width, height);
  port.postMessage({ data }, [data.buffer]);
};
