import { describe, expect, it } from 'vitest'
import { parseComfyUI } from '../src/main/services/meta'

type Node = { class_type: string; inputs: Record<string, unknown> }

const run = (graph: Record<string, Node>) => parseComfyUI(JSON.stringify(graph), null)

describe('parseComfyUI 多组正负提示词', () => {
  it('标准单组:KSampler + 两个 CLIPTextEncode', () => {
    const m = run({
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl.safetensors' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a cat', clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['1', 1] } },
      '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024 } },
      '5': {
        class_type: 'KSampler',
        inputs: { seed: 42, steps: 30, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0] }
      },
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'x' } }
    })
    expect(m.prompt).toBe('a cat')
    expect(m.negative).toBe('blurry')
    expect(m.params['Steps']).toBe('30')
    expect(m.params['CFG scale']).toBe('7')
    expect(m.params['Seed']).toBe('42')
    expect(m.params['Sampler']).toBe('DPM++ 2M')
    expect(m.models).toContain('sd_xl.safetensors')
  })

  it('正向由 ConditioningCombine 合并两个文本编码:两条都要', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '主体描述' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: '风格补充' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '低质量' } },
      '4': { class_type: 'ConditioningCombine', inputs: { conditioning_1: ['1', 0], conditioning_2: ['2', 0] } },
      '5': {
        class_type: 'KSampler',
        inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['4', 0], negative: ['3', 0] }
      },
      '6': { class_type: 'SaveImage', inputs: { images: ['5', 0] } }
    })
    expect(m.prompt).toContain('主体描述')
    expect(m.prompt).toContain('风格补充')
    expect(m.negative).toBe('低质量')
  })

  it('ConditioningConcat 合并负向:同样全量收集', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '好图' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: '模糊' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '水印' } },
      '4': { class_type: 'ConditioningConcat', inputs: { conditioning_to: ['2', 0], conditioning_from: ['3', 0] } },
      '5': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['1', 0], negative: ['4', 0] } },
      '6': { class_type: 'SaveImage', inputs: { images: ['5', 0] } }
    })
    expect(m.negative).toContain('模糊')
    expect(m.negative).toContain('水印')
    expect(m.prompt).toBe('好图')
  })

  it('负向为 ConditioningZeroOut:应为空,不得把正向文本错报成负向(真实样本 ComfyUI_02919 场景)', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '电影感摄影' } },
      '2': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['1', 0] } },
      '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['1', 0], negative: ['2', 0] } },
      '4': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
    })
    expect(m.prompt).toBe('电影感摄影')
    expect(m.negative).toBeNull()
  })

  it('链式 refine 双采样器:取最终产出图像那一级的正负,不取中间级', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '基础阶段正向' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: '基础阶段负向' } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: '精修阶段正向' } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: '精修阶段负向' } },
      '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512 } },
      '6': { class_type: 'KSampler', inputs: { seed: 1, steps: 25, cfg: 6, sampler_name: 'euler', positive: ['1', 0], negative: ['2', 0], latent_image: ['5', 0] } },
      '7': { class_type: 'KSampler', inputs: { seed: 2, steps: 12, cfg: 3.5, sampler_name: 'dpmpp_2m', denoise: 0.4, positive: ['3', 0], negative: ['4', 0], latent_image: ['6', 0] } },
      '8': { class_type: 'SaveImage', inputs: { images: ['7', 0] } }
    })
    expect(m.prompt).toBe('精修阶段正向')
    expect(m.negative).toBe('精修阶段负向')
    expect(m.params['Steps']).toBe('12')
    expect(m.params['Denoise']).toBe('0.4')
  })

  it('SamplerCustom + CFGGuider:正负经 conditional/unconditional,参数在 Guider/Scheduler/Select 上', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: 'flux 正向' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: 'flux 负向' } },
      '3': { class_type: 'CFGGuider', inputs: { cfg: 2.5, conditional: ['1', 0], unconditional: ['2', 0] } },
      '4': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
      '5': { class_type: 'BasicScheduler', inputs: { scheduler: 'simple', steps: 28, denoise: 1 } },
      '6': { class_type: 'EmptySD3LatentImage', inputs: { width: 1024, height: 1024 } },
      '7': {
        class_type: 'SamplerCustom',
        inputs: { noise_seed: 99, guider: ['3', 0], sampler: ['4', 0], sigmas: ['5', 0], latent_image: ['6', 0] }
      },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0] } },
      '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } }
    })
    expect(m.prompt).toBe('flux 正向')
    expect(m.negative).toBe('flux 负向')
    expect(m.params['CFG scale']).toBe('2.5')
    expect(m.params['Steps']).toBe('28')
    expect(m.params['Sampler']).toBe('euler')
    expect(m.params['Seed']).toBe('99')
  })

  it('Qwen 双键节点:prompt/negative_prompt 分离,空负向不为空兜底', () => {
    const m = run({
      '1': { class_type: 'TextEncodeQwenImage21', inputs: { prompt: 'qwen 正向', negative_prompt: '' } },
      '2': {
        class_type: 'KSampler',
        inputs: { seed: 7, steps: 20, cfg: 4, sampler_name: 'euler', positive: ['1', 0], negative: ['1', 1] }
      },
      '3': { class_type: 'SaveImage', inputs: { images: ['2', 0] } }
    })
    expect(m.prompt).toBe('qwen 正向')
    expect(m.negative).toBeNull()
  })

  it('A/B 对比双保存节点共享条件:文本不重复', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '共享正向' } },
      '2': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['1', 0] } },
      '3': { class_type: 'KSampler', inputs: { seed: 2, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['1', 0] } },
      '4': { class_type: 'SaveImage', inputs: { images: ['2', 0] } },
      '5': { class_type: 'SaveImage', inputs: { images: ['3', 0] } }
    })
    expect(m.prompt).toBe('共享正向')
    expect(m.prompt!.split('共享正向').length - 1).toBe(1)
  })

  it('文本由 StringConcat + Primitive 拼接:沿字符串引用收集', () => {
    const m = run({
      '1': { class_type: 'PrimitiveString', inputs: { string: '前半段' } },
      '2': { class_type: 'PrimitiveString', inputs: { string: '后半段' } },
      '3': { class_type: 'StringConcat', inputs: { string1: ['1', 0], string2: ['2', 0] } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: ['3', 0] } },
      '5': { class_type: 'CLIPTextEncode', inputs: { text: '负向' } },
      '6': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['4', 0], negative: ['5', 0] } },
      '7': { class_type: 'SaveImage', inputs: { images: ['6', 0] } }
    })
    expect(m.prompt).toContain('前半段')
    expect(m.prompt).toContain('后半段')
    expect(m.negative).toBe('负向')
  })

  it('无保存节点的残缺图:退回所有采样器收集', () => {
    const m = run({
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '正向' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: '负向' } },
      '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 5, sampler_name: 'euler', positive: ['1', 0], negative: ['2', 0] } }
    })
    expect(m.prompt).toBe('正向')
    expect(m.negative).toBe('负向')
  })

  it('视频流 SamplerCustomAdvanced + BasicGuider(单 conditioning)+ 非标准编码节点(AnimateDiff 真实场景)', () => {
    const m = run({
      '122': { class_type: 'VAEDecode', inputs: { samples: ['125', 0] } },
      '123': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
      '124': { class_type: 'BasicScheduler', inputs: { scheduler: 'simple', steps: 22, denoise: 1 } },
      '125': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['129', 0], guider: ['126', 0], sampler: ['123', 0], sigmas: ['124', 0], latent_image: ['143', 0] } },
      '126': { class_type: 'BasicGuider', inputs: { model: ['127', 0], conditioning: ['136', 0] } },
      '127': { class_type: 'UNETLoader', inputs: { unet_name: 'wan.safetensors' } },
      '129': { class_type: 'RandomNoise', inputs: { noise_seed: 123 } },
      '130': { class_type: 'CreateVideo', inputs: { fps: 16, images: ['122', 0] } },
      '136': { class_type: 'MiniMaxH3ReferenceToVideo', inputs: { prompt: '视频提示词内容', width: 1280, height: 720, length: 121 } },
      '143': { class_type: 'VHS_LoadVideo', inputs: { video: 'a.mp4' } },
      '144': { class_type: 'VHS_VideoCombine', inputs: { images: ['130', 0], frame_rate: 16 } }
    })
    expect(m.prompt).toBe('视频提示词内容')
    expect(m.negative).toBeNull()
    expect(m.params['Steps']).toBe('22')
    expect(m.params['Sampler']).toBe('euler')
  })

  it('无采样器的 API 生图流(GPT-Image):取全图最长提示词字串', () => {
    const m = run({
      '1': { class_type: 'GPTImageOpenAI', inputs: { prompt: '画一只戴帽子的猫', api_key: 'x', model: 'gpt-image-1' } },
      '4': { class_type: 'SaveImage', inputs: { images: ['1', 0] } },
      '7': { class_type: 'Text Multiline', inputs: { text: '画一只戴帽子的猫' } }
    })
    expect(m.prompt).toBe('画一只戴帽子的猫')
  })
})
