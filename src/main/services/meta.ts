import * as fs from 'fs'
import * as zlib from 'zlib'
import exifr from 'exifr'
import type { AiMeta, ExifInfo } from '../../shared/types'

/** EXIF 摄影参数 */
export async function readExif(file: string): Promise<ExifInfo | null> {
  try {
    const o = (await exifr.parse(file, {
      tiff: true,
      exif: true,
      ifd0: {},
      gps: false,
      interop: false,
      translateValues: true
    })) as Record<string, unknown> | undefined
    if (!o) return null
    const get = (k: string): unknown => o[k]
    const make = strOrNull(get('Make'))
    const model = strOrNull(get('Model'))
    const fNumber = numOrNull(get('FNumber'))
    const exposureTime = numOrNull(get('ExposureTime'))
    const iso = numOrNull(get('ISO'))
    const focalLength = numOrNull(get('FocalLength'))
    const dto = get('DateTimeOriginal') ?? get('CreateDate')
    const dateTimeOriginal = dto ? new Date(dto as Date).toISOString() : null
    if (!make && !model && !fNumber && !exposureTime && !iso && !focalLength) return null
    return { make, model, fNumber, exposureTime, iso, focalLength, dateTimeOriginal }
  } catch {
    return null
  }
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && !isNaN(v) ? v : null
}

/** AI 生图元数据:PNG 文本块 / JPEG UserComment */
export async function readAiMeta(file: string, ext: string): Promise<AiMeta | null> {
  let texts: Record<string, string> = {}
  try {
    if (ext === 'png' || ext === 'webp') {
      texts = await readPngText(file)
    } else if (ext === 'jpg' || ext === 'jpeg') {
      const uc = await exifr.parse(file, { pick: ['UserComment'] } as never)
      const v = (uc as { UserComment?: unknown } | undefined)?.UserComment
      if (typeof v === 'string' && v.trim()) texts['parameters'] = v.trim()
    }
  } catch {
    return null
  }

  const paramsText = texts['parameters']
  const promptText = texts['prompt']
  const workflowText = texts['workflow']

  if (paramsText) {
    return parseA1111(paramsText)
  }
  if (promptText || workflowText) {
    return parseComfyUI(promptText || '', workflowText || null)
  }
  return null
}

/** 读取 PNG 的 tEXt / iTXt / zTXt 文本块 */
async function readPngText(file: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const fh = await fs.promises.open(file, 'r')
  try {
    const sig = Buffer.alloc(8)
    await fh.read(sig, 0, 8, 0)
    if (sig.readUInt32BE(0) !== 0x89504e47) return out
    let pos = 8
    const header = Buffer.alloc(8)
    while (true) {
      const { bytesRead } = await fh.read(header, 0, 8, pos)
      if (bytesRead < 8) break
      const len = header.readUInt32BE(0)
      const type = header.toString('ascii', 4, 8)
      const data = Buffer.alloc(len)
      await fh.read(data, 0, len, pos + 8)
      pos += 12 + len
      if (type === 'tEXt') {
        const z = data.indexOf(0)
        if (z > 0) {
          out[data.toString('latin1', 0, z)] = data.toString('utf8', z + 1)
        }
      } else if (type === 'iTXt') {
        const z = data.indexOf(0)
        if (z > 0) {
          const keyword = data.toString('latin1', 0, z)
          const flags = data[z + 1]
          let rest = z + 3 // 跳过压缩标志、压缩方法
          const l2 = data.indexOf(0, rest)
          rest = l2 + 1
          const l3 = data.indexOf(0, rest)
          rest = l3 + 1
          let text = data.subarray(rest)
          if (flags & 1) text = zlib.inflateSync(text)
          out[keyword] = text.toString('utf8')
        }
      } else if (type === 'zTXt') {
        const z = data.indexOf(0)
        if (z > 0) {
          const keyword = data.toString('latin1', 0, z)
          const text = zlib.inflateSync(data.subarray(z + 2))
          out[keyword] = text.toString('utf8')
        }
      } else if (type === 'IEND') {
        break
      }
      if (len < 0 || len > 64 * 1024 * 1024) break
    }
  } finally {
    await fh.close()
  }
  return out
}

/** 解析 A1111/Forge 格式:提示词\nNegative prompt: ...\nSteps: 20, ... */
function parseA1111(text: string): AiMeta {
  let prompt = text
  let negative: string | null = null
  let tail = ''
  const negIdx = text.indexOf('Negative prompt:')
  if (negIdx >= 0) {
    prompt = text.slice(0, negIdx).trim()
    const rest = text.slice(negIdx)
    const stepsIdx = rest.lastIndexOf('\nSteps:')
    if (stepsIdx < 0) {
      // 参数可能在同一行
      const lineIdx = rest.indexOf('\n')
      if (lineIdx >= 0 && /^\S+?:/.test(rest.slice(lineIdx + 1))) {
        negative = rest.slice(0, lineIdx).replace('Negative prompt:', '').trim()
        tail = rest.slice(lineIdx + 1)
      } else {
        negative = rest.replace('Negative prompt:', '').trim()
      }
    } else {
      negative = rest.slice(0, stepsIdx).replace('Negative prompt:', '').trim()
      tail = rest.slice(stepsIdx + 1)
    }
  } else {
    const lastLine = text.lastIndexOf('\n')
    if (lastLine >= 0 && /Steps:\s*\d/.test(text.slice(lastLine))) {
      prompt = text.slice(0, lastLine).trim()
      tail = text.slice(lastLine + 1)
    }
  }

  const params: Record<string, string> = {}
  // 按 "键: 值," 拆分,值中可能含逗号
  const parts = tail.split(/,\s*(?=[A-Za-z][\w \-]*:)/)
  for (const part of parts) {
    const m = /^([\w \-]+):\s*(.*)$/.exec(part.trim())
    if (m) params[m[1].trim()] = m[2].trim()
  }

  const models: string[] = []
  if (params['Model']) models.push(params['Model'])
  if (params['Model hash']) models.push(`hash: ${params['Model hash']}`)

  return {
    source: 'a1111',
    prompt: prompt || null,
    negative,
    params,
    models,
    workflow: null,
    raw: text
  }
}

/** 解析 ComfyUI 工作流导出 */
function parseComfyUI(promptText: string, workflowText: string | null): AiMeta {
  let prompt: string | null = null
  let negative: string | null = null
  const params: Record<string, string> = {}
  const models: string[] = []

  const samplerAliases: Record<string, string> = {
    euler_ancestral: 'euler a',
    dpm_2_ancestral: 'DPM2 a',
    dpmpp_2m: 'DPM++ 2M',
    dpmpp_2m_sde: 'DPM++ 2M SDE',
    dpmpp_3m_sde: 'DPM++ 3M SDE',
    dpmpp_sde: 'DPM++ SDE',
    heunpp2: 'Heun++'
  }

  /** API 图里 inputs 的值可能是 ["节点id", 槽位] 引用,取被引用节点的 text */
  const textOfRef = (
    graph: Record<string, { class_type: string; inputs: Record<string, unknown> }>,
    ref: unknown
  ): string | null => {
    if (Array.isArray(ref) && ref.length >= 1) {
      const node = graph[String(ref[0])]
      const t = node?.inputs?.['text']
      if (typeof t === 'string' && t.trim()) return t
    }
    return null
  }

  try {
    if (promptText) {
      const graph = JSON.parse(promptText) as Record<
        string,
        { class_type: string; inputs: Record<string, unknown> }
      >
      const texts: string[] = []
      for (const node of Object.values(graph)) {
        const ct = node.class_type.toLowerCase()
        if (ct.includes('cliptextencode')) {
          const t = node.inputs['text']
          if (typeof t === 'string') texts.push(t)
        }
        if (ct.includes('checkpointloader')) {
          const m = node.inputs['ckpt_name']
          if (typeof m === 'string') models.push(m)
        }
        if (ct.includes('unetloader') || ct.includes('loraloader')) {
          const m = node.inputs['unet_name'] ?? node.inputs['lora_name']
          if (typeof m === 'string') models.push(m)
        }
        if (ct.includes('ksampler')) {
          const inp = node.inputs
          if (typeof inp['steps'] === 'number') params['Steps'] = String(inp['steps'])
          if (typeof inp['cfg'] === 'number') params['CFG scale'] = String(inp['cfg'])
          if (typeof inp['seed'] === 'number') params['Seed'] = String(inp['seed'])
          const sn = inp['sampler_name']
          if (typeof sn === 'string') {
            params['Sampler'] = samplerAliases[sn] ?? sn
          }
          if (typeof inp['denoise'] === 'number') params['Denoise'] = String(inp['denoise'])
          // 正负提示词从采样器的连线精确回溯(ComfyUI 里顺序不固定)
          const pos = textOfRef(graph, inp['positive'])
          const neg = textOfRef(graph, inp['negative'])
          if (pos && !prompt) prompt = pos
          if (neg && !negative) negative = neg
        }
      }
      // 回溯失败时退回顺序启发:第一条为正向,其余为负向
      if (!prompt && texts.length) prompt = texts[0]
      if (!negative && texts.length > 1 && prompt === texts[0]) negative = texts.slice(1).join('\n')
    }
  } catch {
    /* JSON 解析失败则按原文保存 */
  }

  // 只有 workflow(UI 格式,nodes 数组)没有 API prompt 时,从 widgets_values 提取
  if ((!prompt || models.length === 0) && workflowText) {
    try {
      const wf = JSON.parse(workflowText) as {
        nodes?: { type?: string; widgets_values?: unknown[] }[]
      }
      const wfTexts: string[] = []
      for (const node of wf.nodes ?? []) {
        const t = (node.type ?? '').toLowerCase()
        const w = node.widgets_values
        if (!Array.isArray(w)) continue
        if (t.includes('cliptextencode') && typeof w[0] === 'string') {
          wfTexts.push(w[0])
        } else if (t.includes('checkpointloader') && typeof w[0] === 'string') {
          if (!models.includes(w[0])) models.push(w[0])
        } else if (t.includes('loraloader') && typeof w[0] === 'string') {
          if (!models.includes(w[0])) models.push(w[0])
        } else if (t.includes('ksampler')) {
          // KSampler widgets 顺序:seed, control, steps, cfg, sampler, scheduler, denoise
          if (typeof w[2] === 'number' && !params['Steps']) params['Steps'] = String(w[2])
          if (typeof w[3] === 'number' && !params['CFG scale']) params['CFG scale'] = String(w[3])
          if (typeof w[4] === 'string' && !params['Sampler']) {
            params['Sampler'] = samplerAliases[w[4]] ?? w[4]
          }
        }
      }
      if (!prompt && wfTexts.length) prompt = wfTexts[0]
      if (!negative && wfTexts.length > 1) negative = wfTexts.slice(1).join('\n')
    } catch {
      /* 忽略 */
    }
  }

  let workflowPretty: string | null = null
  if (workflowText) {
    try {
      workflowPretty = JSON.stringify(JSON.parse(workflowText), null, 2)
    } catch {
      workflowPretty = workflowText
    }
  }

  return {
    source: 'comfyui',
    prompt,
    negative,
    params,
    models,
    workflow: workflowPretty,
    raw: [promptText, workflowText].filter(Boolean).join('\n\n') || null
  }
}
