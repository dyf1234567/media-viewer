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
    // 文件名基础名(去掉 ComfyUI 的 _00001_ 序列)用于多采样器分支匹配
    const base = file.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '').replace(/_\d{5}_?$/, '')
    return parseComfyUI(promptText || '', workflowText || null, base)
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

/** ComfyUI 导出偶发非法 JSON(如 "is_changed": [NaN]):严格解析失败后消毒重试 */
function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    try {
      return JSON.parse(text.replace(/\bNaN\b/g, 'null')) as T
    } catch {
      return null
    }
  }
}

/** 解析 ComfyUI 工作流导出;fileNameBase 用于多采样器时锁定真正保存本图的分支 */
export function parseComfyUI(promptText: string, workflowText: string | null, fileNameBase?: string): AiMeta {
  let prompt: string | null = null
  let negative: string | null = null
  let meta_candidates: string[] | undefined
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

  interface GNode {
    class_type: string
    inputs?: Record<string, unknown>
  }
  type Graph = Record<string, GNode>

  /** 文本编码节点识别:CLIPEncodeXxx / TextEncodeQwenImage21 / ShowText(LLM 输出缓存) 等都覆盖 */
  const isTextNode = (ct: string): boolean => /cliptextencode|textencode|showtext/i.test(ct)
  /** 采样节点:KSampler 系与 SamplerCustom 系 */
  const isSamplerNode = (node: GNode): boolean => {
    const c = node.class_type.toLowerCase()
    return c.includes('ksampler') || c.includes('samplercustom')
  }
  /** 保存/预览节点:图像从这里落地,是回溯的起点 */
  const isSaveNode = (ct: string): boolean => /^(save|preview)/i.test(ct) || /videocombine/i.test(ct)

  const posTextOf = (node: GNode): string | null => {
    const inp = node.inputs ?? {}
    // text_0 是 ShowText 等节点缓存的运行时实际文本(LLM 生成结果),优先取
    for (const k of ['text_0', 'prompt', 'text', 'text_pos', 'texts', 'positive_prompt', 'populated_text', 'wildcard_text']) {
      const v = inp[k]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
    return null
  }
  const negTextOf = (node: GNode): string | null => {
    const inp = node.inputs ?? {}
    const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const explicit = str(inp['negative_prompt']) ?? str(inp['negative']) ?? str(inp['text_neg']) ?? str(inp['neg'])
    if (explicit) return explicit
    // 双键节点(prompt/negative_prompt 型)负向为空就是空,不能兜底取正向文本
    const hasDual = 'negative_prompt' in inp || 'text_neg' in inp
    if (hasDual) return null
    return str(inp['text']) ?? str(inp['prompt'])
  }

  /** 沿引用打捞文本;showTextOnly=true 时只收集 ShowText 缓存的运行时输出(LLM 实际生效的提示词) */
  const followStringRefs = (graph: Graph, id: string, depth: number, seen: Set<string>, out: string[], showTextOnly: boolean): void => {
    if (depth > 10 || seen.has(id)) return
    seen.add(id)
    const node = graph[id]
    if (!node) return
    const inp = node.inputs ?? {}
    if (/showtext/i.test(node.class_type)) {
      const t = posTextOf(node)
      if (t && !out.includes(t)) out.push(t)
      return
    }
    // ifElse/switch 节点:按缓存的 boolean 选择分支,不两个都收(easy ifElse 的 boolean 是运行时真值)
    if (/ifelse|switch/i.test(node.class_type)) {
      const b = inp['boolean']
      const branch = b === true || (typeof b === 'string' && b.toLowerCase() === 'true') ? 'on_true' : b === false || (typeof b === 'string' && b.toLowerCase() === 'false') ? 'on_false' : null
      if (branch) {
        const v = inp[branch]
        if (Array.isArray(v)) followStringRefs(graph, String(v[0]), depth + 1, seen, out, showTextOnly)
        else if (typeof v === 'string' && v.trim() && !out.includes(v)) out.push(v)
        return
      }
    }
    if (showTextOnly) {
      for (const v of Object.values(inp)) {
        if (Array.isArray(v)) followStringRefs(graph, String(v[0]), depth + 1, seen, out, true)
      }
      return
    }
    for (const [k, v] of Object.entries(inp)) {
      if (/neg|seed|image|latent|model|clip|vae|video|audio/i.test(k)) continue
      if (typeof v === 'string' && v.trim() && /string|text|prompt|value/i.test(k)) {
        if (!out.includes(v)) out.push(v)
      } else if (Array.isArray(v)) {
        followStringRefs(graph, String(v[0]), depth + 1, seen, out, false)
      }
    }
  }

  /**
   * 取节点在某方向上的提示词文本:先读直连字串,不是字串则按方向沿对应键的引用打捞
   * (LLM 生成节点 / StringConcat 拼接 / Primitive 值等场景)。
   */
  const fishText = (graph: Graph, node: GNode, dir: 'pos' | 'neg'): string | null => {
    const direct = dir === 'pos' ? posTextOf(node) : negTextOf(node)
    if (direct) return direct
    const inp = node.inputs ?? {}
    const hasDual = 'negative_prompt' in inp || 'text_neg' in inp
    const strKeys =
      dir === 'pos'
        ? ['prompt', 'text', 'text_pos', 'texts', 'positive_prompt']
        : ['negative_prompt', 'negative', 'text_neg', 'neg']
    if (dir === 'neg' && !hasDual) strKeys.push('text', 'prompt')
    // 两级策略:先只找 ShowText 缓存的运行时文本(LLM 实际生效值),找不到再收集通配符/拼接串
    const runtime: string[] = []
    for (const k of strKeys) {
      const v = inp[k]
      if (Array.isArray(v)) followStringRefs(graph, String(v[0]), 0, new Set(), runtime, true)
    }
    if (runtime.length) return runtime.join('\n')
    const parts: string[] = []
    for (const k of strKeys) {
      const v = inp[k]
      if (Array.isArray(v)) followStringRefs(graph, String(v[0]), 0, new Set(), parts, false)
    }
    return parts.join('\n') || null
  }

  /**
   * 沿条件(Conditioning)引用收集该方向上的全部提示词文本。
   * 一个流的正/负向可能由 ConditioningCombine/Concat 合并多个文本编码节点组成,
   * 这里把整棵条件子树走完、按方向取文本,而不是只取第一个命中的节点。
   */
  const collectCond = (graph: Graph, ref: unknown, dir: 'pos' | 'neg', depth: number, seen: Set<string>, out: string[]): void => {
    if (depth > 16 || !Array.isArray(ref)) return
    const id = String(ref[0])
    if (seen.has(id)) return
    seen.add(id)
    const node = graph[id]
    if (!node) return
    const ct = node.class_type
    if (isTextNode(ct)) {
      const t = fishText(graph, node, dir)
      if (t && !out.includes(t)) out.push(t)
      return
    }
    // 负向置零 = 空条件,不能穿透(否则会把正向文本错当负向)
    if (/conditioningzeroout/i.test(ct)) return
    // 泛化:条件子树里任何能取到提示词文本的节点都视为文本源
    // (MiniMaxH3ReferenceToVideo 等非标准编码节点,prompt 是直连字符串而非独立文本节点)
    const t = fishText(graph, node, dir)
    if (t) {
      if (!out.includes(t)) out.push(t)
      return
    }
    for (const [k, v] of Object.entries(node.inputs ?? {})) {
      if (Array.isArray(v) && /cond|positive|negative|prompt|text/i.test(k)) {
        collectCond(graph, v, dir, depth + 1, seen, out)
      }
    }
  }

  /** 从保存节点沿图像链回溯到产出这张图的采样器(链式 refine 时是最末一级) */
  const backToSampler = (graph: Graph, id: string, depth: number, seen: Set<string>): GNode | null => {
    if (depth > 32 || seen.has(id)) return null
    seen.add(id)
    const node = graph[id]
    if (!node) return null
    if (isSamplerNode(node)) return node
    const pri = ['samples', 'latent_image', 'image', 'images', 'latent']
    const keys = Object.keys(node.inputs ?? {})
    const ordered = [...pri.filter((k) => keys.includes(k)), ...keys.filter((k) => !pri.includes(k))]
    for (const k of ordered) {
      const v = node.inputs?.[k]
      if (Array.isArray(v)) {
        const r = backToSampler(graph, String(v[0]), depth + 1, seen)
        if (r) return r
      }
    }
    return null
  }

  /** KSampler / KSamplerAdvanced / SamplerCustom(+Guider+Scheduler) 的采样参数 */
  const readSamplerParams = (graph: Graph, sm: GNode): void => {
    const inp = sm.inputs ?? {}
    const ct = sm.class_type.toLowerCase()
    if (typeof inp['steps'] === 'number') params['Steps'] = String(inp['steps'])
    if (typeof inp['cfg'] === 'number') params['CFG scale'] = String(inp['cfg'])
    if (typeof inp['seed'] === 'number') params['Seed'] = String(inp['seed'])
    else if (typeof inp['noise_seed'] === 'number') params['Seed'] = String(inp['noise_seed'])
    const sn = inp['sampler_name']
    if (typeof sn === 'string') params['Sampler'] = samplerAliases[sn] ?? sn
    if (typeof inp['denoise'] === 'number') params['Denoise'] = String(inp['denoise'])
    if (ct.includes('samplercustom')) {
      // SamplerCustom:CFG 在 Guider 上,步数/去噪在 Scheduler 上,采样器名在 KSamplerSelect 上
      const ref = (v: unknown): GNode | null => (Array.isArray(v) ? graph[String(v[0])] ?? null : null)
      const g = ref(inp['guider'])
      if (g && typeof g.inputs?.['cfg'] === 'number' && !params['CFG scale']) {
        params['CFG scale'] = String(g.inputs['cfg'])
      }
      const sg = ref(inp['sigmas'])
      if (sg) {
        const st = sg.inputs?.['steps'] ?? sg.inputs?.['nsteps']
        if (typeof st === 'number' && !params['Steps']) params['Steps'] = String(st)
        const dz = sg.inputs?.['denoise']
        if (typeof dz === 'number' && !params['Denoise']) params['Denoise'] = String(dz)
      }
      const sel = ref(inp['sampler'])
      const selName = sel?.inputs?.['sampler_name']
      if (typeof selName === 'string' && !params['Sampler']) params['Sampler'] = samplerAliases[selName] ?? selName
    }
  }

  try {
    if (promptText) {
      const graph = safeJsonParse<Graph>(promptText)
      if (graph) {
        const texts: string[] = []
      for (const node of Object.values(graph)) {
        const ct = node.class_type.toLowerCase()
        if (isTextNode(ct)) {
          const p = posTextOf(node)
          const ng = negTextOf(node)
          if (p) texts.push(p)
          // 单键节点的负向兜底就是正向文本本身,收集时去重,避免顺序启发把正向错当负向
          if (ng && ng !== p) texts.push(ng)
        }
        if (ct.includes('checkpointloader')) {
          const m = node.inputs?.['ckpt_name']
          if (typeof m === 'string') models.push(m)
        }
        if (ct.includes('unetloader') || ct.includes('loraloader')) {
          const m = node.inputs?.['unet_name'] ?? node.inputs?.['lora_name']
          if (typeof m === 'string') models.push(m)
        }
      }

      // 最终采样器:直接产出被保存图像的采样节点(链式 refine 取末级;A/B 对比流可能有多个)
      // 有文件名提示时,优先取「保存节点文件名前缀与本图文件名一致」的分支——多采样器工作流
      // 的每个 SaveImage 都嵌入同一份完整工作流,只有前缀匹配才能锁定真正产出本图的采样器
      const savePairs: { nodeId: string; prefix: string; sampler: GNode }[] = []
      for (const [id, node] of Object.entries(graph)) {
        if (!isSaveNode(node.class_type)) continue
        const prefix = typeof node.inputs?.['filename_prefix'] === 'string' ? (node.inputs['filename_prefix'] as string) : ''
        for (const v of Object.values(node.inputs ?? {})) {
          if (Array.isArray(v)) {
            const r = backToSampler(graph, String(v[0]), 0, new Set())
            if (r && !savePairs.some((p) => p.sampler === r && p.nodeId === id)) {
              savePairs.push({ nodeId: id, prefix, sampler: r })
            }
          }
        }
      }
      const samplerNodes = Object.values(graph).filter(isSamplerNode)
      let targetSamplers: GNode[] = savePairs.map((p) => p.sampler)
      if (fileNameBase) {
        const matched = savePairs.filter((p) => {
          const base = p.prefix.split(/[\\/]/).pop() ?? ''
          return base === fileNameBase
        })
        if (matched.length) targetSamplers = matched.map((p) => p.sampler)
      }
      if (!targetSamplers.length) targetSamplers = samplerNodes

      // 正/负向:沿最终采样器的条件连线整棵收集(KSampler 直接 positive/negative;SamplerCustom 经 Guider)
      const posTexts: string[] = []
      const negTexts: string[] = []
      for (const sm of targetSamplers) {
        const inp = sm.inputs ?? {}
        if (Array.isArray(inp['positive'])) collectCond(graph, inp['positive'], 'pos', 0, new Set(), posTexts)
        if (Array.isArray(inp['negative'])) collectCond(graph, inp['negative'], 'neg', 0, new Set(), negTexts)
        const guider = Array.isArray(inp['guider']) ? graph[String(inp['guider'][0])] : null
        if (guider) {
          // BasicGuider(视频流常见)只有 conditioning 一个入口
          for (const pk of ['conditional', 'positive', 'conditioning_1', 'conditioning']) {
            if (Array.isArray(guider.inputs?.[pk])) collectCond(graph, guider.inputs[pk], 'pos', 0, new Set(), posTexts)
          }
          for (const nk of ['unconditional', 'negative', 'conditioning_2']) {
            if (Array.isArray(guider.inputs?.[nk])) collectCond(graph, guider.inputs[nk], 'neg', 0, new Set(), negTexts)
          }
        }
      }
      if (posTexts.length) prompt = posTexts.join('\n')
      if (negTexts.length) negative = negTexts.join('\n')

      // 候选提示词:复用工作流的 ShowText 缓存可能串图(最后一次运行的值),
      // 把全图所有 ShowText 缓存收集为候选,面板可切换比对画面选正确的
      if (prompt) {
        const cands: string[] = []
        for (const node of Object.values(graph)) {
          if (!/showtext/i.test(node.class_type)) continue
          const t = node.inputs?.['text_0']
          if (typeof t === 'string' && t.trim().length >= 12 && t.trim() !== prompt && !cands.includes(t.trim())) {
            cands.push(t.trim())
          }
        }
        if (cands.length) meta_candidates = cands
      }

      if (targetSamplers.length) readSamplerParams(graph, targetSamplers[0])

      // 回溯失败时退回旧启发:任何带 positive/negative 的节点回溯单文本
      if (!prompt || !negative) {
        for (const node of Object.values(graph)) {
          if (!node.inputs) continue
          if (!prompt && Array.isArray(node.inputs['positive'])) {
            const tn = graph[String(node.inputs['positive'][0])]
            if (tn && isTextNode(tn.class_type)) {
              const p = posTextOf(tn)
              if (p) prompt = p
            }
          }
          if (!negative && Array.isArray(node.inputs['negative'])) {
            const tn = graph[String(node.inputs['negative'][0])]
            if (tn && isTextNode(tn.class_type)) {
              const ng = negTextOf(tn)
              if (ng) negative = ng
            }
          }
        }
      }
      // 仍失败时按顺序启发:第一条为正向,其余为负向
      if (!prompt && texts.length) prompt = texts[0]
      if (!negative && texts.length > 1 && prompt === texts[0]) negative = texts.slice(1).join('\n')
      // 无采样器的工作流(如 GPT-Image 等 API 生图):取全图最长的提示词字串
      if (!prompt && samplerNodes.length === 0) {
        let longest: string | null = null
        for (const node of Object.values(graph)) {
          const p = posTextOf(node)
          if (p && (!longest || p.length > longest.length)) longest = p
        }
        if (longest) prompt = longest
      }
      }
    }
  } catch {
    /* JSON 解析失败则按原文保存 */
  }

  // 只有 workflow(UI 格式,nodes 数组)没有 API prompt 时,从 widgets_values 提取
  if ((!prompt || models.length === 0) && workflowText) {
    try {
      const wf = safeJsonParse<{ nodes?: { type?: string; widgets_values?: unknown[] }[] }>(workflowText)
      if (wf) {
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
      }
    } catch {
      /* 忽略 */
    }
  }

  let workflowPretty: string | null = null
  if (workflowText) {
    const pretty = safeJsonParse<unknown>(workflowText)
    workflowPretty = pretty ? JSON.stringify(pretty, null, 2) : workflowText
  }

  return {
    source: 'comfyui',
    prompt,
    negative,
    params,
    models,
    workflow: workflowPretty,
    raw: [promptText, workflowText].filter(Boolean).join('\n\n') || null,
    promptCandidates: meta_candidates
  }
}
