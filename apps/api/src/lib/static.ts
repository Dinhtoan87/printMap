import { existsSync } from 'node:fs';
import { extname } from 'node:path';

const MIME: Record<string, string> = {
  '.pmtiles': 'application/octet-stream',
  '.pbf': 'application/x-protobuf',
  '.json': 'application/json',
  '.geojson': 'application/geo+json',
  '.png': 'image/png',
  '.webp': 'image/webp'
};

const contentType = (path: string) => MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';

const baseHeaders = (path: string): Record<string, string> => ({
  'Content-Type': contentType(path),
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300'
});

/**
 * Phục vụ một file tĩnh có hỗ trợ HTTP Range (206 Partial Content).
 * Bắt buộc cho .pmtiles vì thư viện pmtiles đọc theo từng byte-range.
 */
export async function serveFileWithRange(path: string, rangeHeader?: string | null): Promise<Response> {
  if (!existsSync(path)) {
    return new Response('Not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
  const file = Bun.file(path);
  const size = file.size;
  const headers = baseHeaders(path);
  headers['Accept-Ranges'] = 'bytes';

  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (m) {
      let start = m[1] === '' ? NaN : Number(m[1]);
      let end = m[2] === '' ? NaN : Number(m[2]);
      if (Number.isNaN(start)) {
        // suffix range: bytes=-N (N byte cuối)
        const suffix = Number(m[2]);
        start = Math.max(0, size - suffix);
        end = size - 1;
      } else if (Number.isNaN(end)) {
        end = size - 1;
      }
      if (start > end || start >= size) {
        return new Response('Range Not Satisfiable', {
          status: 416,
          headers: { ...headers, 'Content-Range': `bytes */${size}` }
        });
      }
      end = Math.min(end, size - 1);
      const chunk = file.slice(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          ...headers,
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end - start + 1)
        }
      });
    }
  }

  return new Response(file, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
}
