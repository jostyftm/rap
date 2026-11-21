import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import type http from "node:http";
import type net from "node:net";
import type { Duplex } from "node:stream";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

/**
 * Conexión WebSocket RFC 6455 sin dependencias externas construida sobre un socket TCP/Duplex.
 * Soporta tramas de texto (UTF-8), binarias (Buffer), fragmentación, ping/pong y cierre limpio.
 */
export class WsConnection extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: number = WsConnection.OPEN;
  private buffer: Buffer = Buffer.alloc(0);
  private fragOpcode: number | null = null;
  private fragChunks: Buffer[] = [];
  private fragSize = 0;

  constructor(
    private socket: Duplex,
    head?: Buffer,
    private maxPayload = 4 * 1024 * 1024
  ) {
    super();

    if ("setNoDelay" in socket && typeof (socket as net.Socket).setNoDelay === "function") {
      (socket as net.Socket).setNoDelay(true);
    }

    socket.on("data", (chunk: Buffer) => this.onData(chunk));
    socket.on("close", () => this.handleClosed());
    socket.on("end", () => this.handleClosed());
    socket.on("error", (err: Error) => {
      if (this.listenerCount("error") > 0) {
        this.emit("error", err);
      }
      this.handleClosed();
    });

    if (head && head.length > 0) {
      this.onData(head);
    }
  }

  get bufferedAmount(): number {
    return this.socket.writableLength;
  }

  send(data: string | Buffer | Uint8Array): void {
    if (typeof data === "string") {
      this.sendFrame(0x01, Buffer.from(data, "utf8"));
      return;
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    this.sendFrame(0x02, buf);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === WsConnection.CLOSED || this.readyState === WsConnection.CLOSING) {
      return;
    }
    this.readyState = WsConnection.CLOSING;

    const reasonBuf = Buffer.from(reason, "utf8");
    const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    if (reasonBuf.length > 0) {
      reasonBuf.copy(payload, 2);
    }
    this.sendFrame(0x08, payload);
    this.readyState = WsConnection.CLOSED;
    try {
      this.socket.end();
    } catch {
      // ignorar error al cerrar
    }
  }

  terminate(): void {
    this.readyState = WsConnection.CLOSED;
    try {
      this.socket.destroy();
    } catch {
      // ignorar
    }
  }

  private handleClosed(): void {
    if (this.readyState === WsConnection.CLOSED) return;
    this.readyState = WsConnection.CLOSED;
    this.fragOpcode = null;
    this.fragChunks = [];
    this.fragSize = 0;
    this.buffer = Buffer.alloc(0);
    this.emit("close");
  }

  private onData(chunk: Buffer): void {
    if (this.readyState === WsConnection.CLOSED) return;
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < offset + 2) break;
        payloadLen = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (this.buffer.length < offset + 8) break;
        const bigLen = this.buffer.readBigUInt64BE(offset);
        offset += 8;
        if (bigLen > BigInt(this.maxPayload)) {
          this.close(1009, "Message too big");
          return;
        }
        payloadLen = Number(bigLen);
      }

      if (payloadLen > this.maxPayload) {
        this.close(1009, "Message too big");
        return;
      }

      const maskLen = masked ? 4 : 0;
      const frameEnd = offset + maskLen + payloadLen;
      if (this.buffer.length < frameEnd) break;

      const payload = Buffer.from(this.buffer.subarray(offset + maskLen, frameEnd));
      if (masked) {
        const maskKey = this.buffer.subarray(offset, offset + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i & 3];
        }
      }

      const remaining = this.buffer.subarray(frameEnd);
      this.buffer = remaining.length > 0 ? Buffer.from(remaining) : Buffer.alloc(0);

      if (opcode === 0x08) {
        // Frame de cierre
        const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1000;
        if (this.readyState === WsConnection.OPEN) {
          this.close(code);
        } else {
          this.handleClosed();
        }
        return;
      }

      if (opcode === 0x09) {
        // Ping -> responder Pong con el mismo payload
        this.sendFrame(0x0a, payload);
        continue;
      }

      if (opcode === 0x0a) {
        this.emit("pong", payload);
        continue;
      }

      if (opcode === 0x01 || opcode === 0x02) {
        if (fin) {
          this.emit("message", payload, opcode === 0x02);
        } else {
          this.fragOpcode = opcode;
          this.fragChunks = [payload];
          this.fragSize = payload.length;
        }
        continue;
      }

      if (opcode === 0x00 && this.fragOpcode !== null) {
        if (this.fragSize + payload.length > this.maxPayload) {
          this.close(1009, "Fragmented message too big");
          return;
        }
        this.fragChunks.push(payload);
        this.fragSize += payload.length;
        if (fin) {
          const full = Buffer.concat(this.fragChunks);
          const isBinary = this.fragOpcode === 0x02;
          this.fragOpcode = null;
          this.fragChunks = [];
          this.fragSize = 0;
          this.emit("message", full, isBinary);
        }
      }
    }
  }

  private sendFrame(opcode: number, payload: Buffer): void {
    if (this.readyState === WsConnection.CLOSED) return;
    if (this.readyState !== WsConnection.OPEN && opcode !== 0x08) return;
    if (this.socket.destroyed || !this.socket.writable) return;

    const len = payload.length;
    let header: Buffer;

    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = len;
    } else if (len <= 0xffff) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x80 | (opcode & 0x0f);
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    try {
      this.socket.write(Buffer.concat([header, payload]));
    } catch {
      this.handleClosed();
    }
  }
}

/**
 * Servidor de actualización WebSocket (HTTP 101 Switching Protocols) sobre `http.Server`.
 */
export class WsServer {
  readonly clients = new Set<WsConnection>();

  handleUpgrade(
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (client: WsConnection, request: http.IncomingMessage) => void
  ): void {
    const upgradeHeader = req.headers.upgrade;
    const key = req.headers["sec-websocket-key"];

    if (
      !upgradeHeader ||
      upgradeHeader.toLowerCase() !== "websocket" ||
      typeof key !== "string" ||
      key.trim().length === 0
    ) {
      socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const accept = createHash("sha1")
      .update(key.trim() + WS_GUID)
      .digest("base64");

    const responseHeaders = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      "",
    ].join("\r\n");

    socket.write(responseHeaders);

    const client = new WsConnection(socket, head);
    this.clients.add(client);
    client.once("close", () => {
      this.clients.delete(client);
    });

    callback(client, req);
  }

  close(): void {
    for (const client of [...this.clients]) {
      client.close(1001, "Server closing");
    }
    this.clients.clear();
  }
}
