import { readFile } from 'node:fs/promises';
import { createServer, STATUS_CODES } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { extname, isAbsolute, relative, resolve } from 'node:path';

import { z } from 'zod';

import {
  FMG_ASSET_ENTRY_FILE,
  FMG_ASSET_SERVER_ANY_PORT,
  FMG_ASSET_SERVER_HOST,
  HTTP_METHODS,
  PORT_IN_USE_ERROR_CODE,
} from './fmg-asset-server.constants';
import type { iFmgAssetServerAddress } from './fmg-asset-server.types';

const portInUseErrorSchema = z.object({ code: z.literal(PORT_IN_USE_ERROR_CODE) });

/** Serves the bundled FMG to its iframe without relying on Obsidian's blocked nested app:// resources. */
export class FmgAssetServer {
  private server: Server | null = null;

  private authority: string | null = null;

  public constructor(private readonly assetRootPath: string) {}

  /**
   * FMG keeps its options in the page's localStorage, which belongs to the page's origin, port included. Reusing the
   * port of the previous session keeps those options; a taken port falls back to a free one.
   */
  public async start(preferredPort: number | null): Promise<iFmgAssetServerAddress> {
    if (this.server || this.authority) throw new Error('The FMG asset server is already running.');

    const server = createServer((request, response) => {
      void this.handleRequest(request, response).catch(() => {
        if (!response.headersSent) this.respondWithStatus(response, 500);
        else response.destroy();
      });
    });

    try {
      await this.listen(server, preferredPort ?? FMG_ASSET_SERVER_ANY_PORT);
    } catch (error) {
      if (preferredPort === null || !this.isPortInUseError(error)) throw error;
      await this.listen(server, FMG_ASSET_SERVER_ANY_PORT);
    }

    const address = server.address();
    if (!address || typeof address === 'string') {
      await this.closeServer(server);
      throw new Error('The FMG asset server did not receive a TCP address.');
    }

    this.server = server;
    this.authority = `${FMG_ASSET_SERVER_HOST}:${address.port}`;
    return { pageUrl: `http://${this.authority}/${FMG_ASSET_ENTRY_FILE}`, port: address.port };
  }

  public async stop() {
    const server = this.server;
    this.server = null;
    this.authority = null;
    if (server) await this.closeServer(server);
  }

  private async listen(server: Server, port: number) {
    await new Promise<void>((resolveStarted, rejectStarted) => {
      function onError(error: Error) {
        server.off('listening', onListening);
        rejectStarted(error);
      }

      function onListening() {
        server.off('error', onError);
        resolveStarted();
      }

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, FMG_ASSET_SERVER_HOST);
    });
  }

  private isPortInUseError(error: unknown) {
    return portInUseErrorSchema.safeParse(error).success;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (request.headers.host !== this.authority) {
      this.respondWithStatus(response, 403);
      return;
    }
    if (request.method !== HTTP_METHODS.GET && request.method !== HTTP_METHODS.HEAD) {
      response.setHeader('Allow', `${HTTP_METHODS.GET}, ${HTTP_METHODS.HEAD}`);
      this.respondWithStatus(response, 405);
      return;
    }

    const assetPath = this.resolveAssetPath(request.url);
    if (!assetPath) {
      this.respondWithStatus(response, 404);
      return;
    }

    let asset: Buffer;
    try {
      asset = await readFile(assetPath);
    } catch {
      this.respondWithStatus(response, 404);
      return;
    }

    response.statusCode = 200;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', this.readContentType(assetPath));
    response.setHeader('Content-Length', asset.byteLength);
    response.end(request.method === HTTP_METHODS.HEAD ? undefined : asset);
  }

  private resolveAssetPath(requestUrl: string | undefined): string | null {
    if (!requestUrl) return null;

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(new URL(requestUrl, `http://${FMG_ASSET_SERVER_HOST}`).pathname);
    } catch {
      return null;
    }
    if (decodedPath.includes('\0')) return null;

    const relativeAssetPath = decodedPath === '/' ? FMG_ASSET_ENTRY_FILE : decodedPath.replace(/^\/+/, '');
    const assetPath = resolve(this.assetRootPath, relativeAssetPath);
    const pathFromRoot = relative(this.assetRootPath, assetPath);
    if (pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) return null;
    return assetPath;
  }

  private readContentType(assetPath: string): string {
    switch (extname(assetPath).toLowerCase()) {
      case '.css':
        return 'text/css; charset=utf-8';
      case '.gif':
        return 'image/gif';
      case '.html':
        return 'text/html; charset=utf-8';
      case '.ico':
        return 'image/x-icon';
      case '.jpeg':
      case '.jpg':
        return 'image/jpeg';
      case '.js':
        return 'text/javascript; charset=utf-8';
      case '.json':
        return 'application/json; charset=utf-8';
      case '.png':
        return 'image/png';
      case '.svg':
        return 'image/svg+xml';
      case '.ttf':
        return 'font/ttf';
      case '.webp':
        return 'image/webp';
      case '.woff':
        return 'font/woff';
      case '.woff2':
        return 'font/woff2';
      default:
        return 'application/octet-stream';
    }
  }

  private respondWithStatus(response: ServerResponse, statusCode: number) {
    response.statusCode = statusCode;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.end(STATUS_CODES[statusCode] ?? 'Error');
  }

  private async closeServer(server: Server) {
    await new Promise<void>((resolveClosed, rejectClosed) => {
      server.close((error) => {
        if (error) rejectClosed(error);
        else resolveClosed();
      });
    });
  }
}

