import { protocol } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { Readable } from 'stream'
import { extOf, mimeOf } from './services/util'

export const SCHEME = 'mvfile'

/** 必须在 app ready 之前调用 */
export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
        bypassCSP: true
      }
    }
  ])
}

/** 本地文件 → 协议 URL;v 用于缓存失效(文件变化时换 v) */
export function fileUrl(absPath: string, version?: number | string): string {
  const u = `${SCHEME}://f/${encodeURIComponent(absPath)}`
  return version !== undefined ? `${u}?v=${version}` : u
}

/** 注册协议处理器:支持 Range(视频流式拖动进度条) */
export function registerProtocolHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    let filePath = ''
    try {
      const u = new URL(request.url)
      filePath = decodeURIComponent(u.pathname.slice(1))
    } catch {
      return new Response('bad url', { status: 400 })
    }
    if (!path.isAbsolute(filePath)) {
      return new Response('forbidden', { status: 403 })
    }

    let size = 0
    try {
      const st = await fs.promises.stat(filePath)
      if (!st.isFile()) return new Response('not found', { status: 404 })
      size = st.size
    } catch {
      return new Response('not found', { status: 404 })
    }

    const headers = new Headers({
      'Content-Type': mimeOf(extOf(filePath)),
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*',
      // URL 带 ?v= 版本参数,文件变化时换新地址,因此可以放心长缓存
      'Cache-Control': 'public, max-age=604800, immutable'
    })

    const range = request.headers.get('range')
    let start = 0
    let end = size - 1
    let status = 200
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
      if (m) {
        if (m[1]) start = parseInt(m[1], 10)
        if (m[2]) end = parseInt(m[2], 10)
        if (isNaN(start) || start > end || start >= size) {
          return new Response('range not satisfiable', {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` }
          })
        }
        end = Math.min(end, size - 1)
        status = 206
        headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
      }
    }

    headers.set('Content-Length', String(end - start + 1))
    const stream = fs.createReadStream(filePath, { start, end })
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status,
      headers
    })
  })
}
