# ComfyUI 生成信息的提取思路与实现

> 适用代码：`src/main/services/meta.ts`（主进程）、`tests/meta.test.ts`（回归测试）
> 本文整理"从一张 AI 生成图片里还原生成信息"的完整思路、关键代码与已知边界。

---

## 1. 数据从哪里来

不同工具把生成参数写进图片的位置不同，Media Viewer 需要兼容三类：

| 来源 | 载体 | 识别方式 |
|---|---|---|
| ComfyUI | PNG 文本块 `tEXt`：`prompt`（API 格式 JSON）与 `workflow`（UI 格式 JSON） | 按关键字取块 |
| WebUI (A1111/Forge) | JPEG EXIF `UserComment`，格式为 `提示词\nNegative prompt: ...\nSteps: 20, ...` | `parameters` 文本 |
| 通用 | PNG `parameters` 文本块 | 同 A1111 解析 |

入口函数 `readAiMeta(file, ext)` 按扩展名分流：

```ts
if (ext === 'png' || ext === 'webp') texts = await readPngText(file)
else if (ext === 'jpg' || ext === 'jpeg') /* exifr 读 UserComment → texts['parameters'] */

if (paramsText)  return parseA1111(paramsText)
if (promptText || workflowText)
  return parseComfyUI(promptText || '', workflowText || null, fileNameBase)
```

`fileNameBase` 是文件名去掉扩展名与 `_00001_` 序列号后的基础名（如
`krea/2026-09-21/105710_00001_.png → 105710`），后面锁定采样分支时要用。

## 2. PNG 文本块的读取（readPngText）

PNG 由若干 chunk 组成，文本类 chunk 有三种：

- `tEXt`：`关键字\0文本`，latin1 关键字 + utf8 文本
- `iTXt`：`关键字\0压缩标志\0压缩方法\0语言\0翻译关键字\0文本`，压缩标志位 1 时文本经 zlib deflate
- `zTXt`：`关键字\0` + zlib 压缩文本

实现要点：

1. 校验 8 字节 PNG 签名（`0x89504E47`），从偏移 8 开始逐 chunk 走；
2. 每个 chunk 头 8 字节 = 长度(4) + 类型(4)，数据区后跳过 4 字节 CRC；
3. `len < 0 || len > 64MB` 时中断（防损坏文件拖死循环）；
4. 遇 `IEND` 结束。

ComfyUI 的 `prompt` 块很大（本例 178KB），所以 data buffer 按需 `Buffer.alloc(len)` 读取而不是整文件载入。

## 3. ComfyUI 的数据模型

`prompt`（API 格式）是一个**扁平节点图**：

```json
{
  "51": {
    "inputs": { "text": ["1386", 0], "clip": ["56", 0] },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP文本编码" }
  }
}
```

- 键是节点 id；`class_type` 是节点类型；`inputs` 里既可以直接值，也可以是
  `["节点id", 输出槽位]` 形式的**连线引用**。
- 真正描述"这张图怎么生成"的就是这份图；`workflow` 是编辑器 UI 格式（含画布坐标），
  只作为 prompt 缺失时的兜底。

## 4. 三个识别器（一切回溯的起点）

```ts
const isTextNode = (ct) => /cliptextencode|textencode|showtext/i.test(ct)   // 文本编码/缓存
const isSamplerNode = (node) => /ksampler|samplercustom/i.test(node.class_type.toLowerCase())
const isSaveNode = (ct) => /^(save|preview)/i.test(ct) || /videocombine/i.test(ct) // 图像落地处
```

思路：**图片从保存节点落地 → 沿图像链回溯到采样器 → 沿采样器的条件连线收集文本**。
这条"逆着数据流走"的主线保证了取到的是真正产出这张图的分支，而不是工作流里
随便哪个文本框。

## 5. 锁定目标采样器（两个手段叠加）

### 5.1 从保存节点回溯（backToSampler）

从每个保存节点的输入出发深度优先回溯，遇到采样节点即返回。回溯时输入键按
`samples → latent_image → image → images → latent` 优先排序——保证链式
refine（底图 → 放大 → 局部重绘）时取到**最末级**采样器。

### 5.2 文件名前缀匹配（多采样器工作流的关键）

多采样器工作流的每个 SaveImage 都嵌入**同一份完整工作流**，回溯会找到多个采样器。
但每个 SaveImage 有 `filename_prefix`，而落盘文件名 = 前缀 + `_00001_`。所以：

```ts
const matched = savePairs.filter((p) => (p.prefix.split(/[\\/]/).pop() ?? '') === fileNameBase)
if (matched.length) targetSamplers = matched.map((p) => p.sampler)
```

例：`krea/2026-09-21/105710_00001_.png` 的基础名 `105710` 只与前缀
`krea/2026-09-21/105710` 的 SaveImage 匹配，从而锁定它的采样链，排除工作流里
其他采样分支。

### 5.3 采样参数读取（KSampler 与 SamplerCustom 参数位置不同）

- `KSampler`：参数直接在节点上（steps / cfg / seed / sampler_name / denoise）
- `SamplerCustom`：**参数分散在三个上游**——CFG 在 `guider` 上、步数与去噪在
  `sigmas`（调度器）上、采样器名在 `sampler`（KSamplerSelect）上，需要沿引用分别读

## 6. 提示词文本收集（正/负向各一棵树）

从目标采样器的 `positive` / `negative` 引用出发，沿 **conditioning 子树**
（`collectCond`）整棵收集，而不是只取第一个命中节点——一个方向的文本可能由
`ConditioningCombine` / `Concat` 合并多个编码节点。

遍历到文本节点后用 `fishText` 取文字，采用**两级策略**：

1. **运行时文本优先**（`showTextOnly=true`）：只沿引用收集 `ShowText|pysssss`
   等**缓存节点**里的 `text_0` / `populated_text`——这是 LLM 生成节点、通配符节点
   **实际执行时**产出的文本；
2. **静态兜底**：第一级没找到时，再收集子树里的直连字符串（通配符模板、拼接输入）。

设计原因：`DPRandomGenerator` 这类通配符节点，`inputs.text` 存的是
`{选项A|选项B}` 模板，运行时才随机解析——模板没有意义，解析结果只存在于
下游 ShowText 的缓存里。

## 7. 分支选择（ifElse）——本次踩过的坑

**问题**：krea 实图的提示词链上有 `easy ifElse` 节点（LLM 生成场景 vs 通配符拼接
两条候选路）。旧逻辑把**两条候选的文本全部收集**，输出变成多段场景拼接的大杂烩。

**关键认知**：ComfyUI 把执行时的布尔状态存在 ifElse 节点的 `inputs.boolean` 里。
`true → on_true`，`false → on_false`——**没被选中的候选文本根本没有进入本次生成**。

```ts
if (/ifelse|switch/i.test(node.class_type)) {
  const b = inp['boolean']
  const branch = b === true || b === 'true' ? 'on_true'
               : b === false || b === 'false' ? 'on_false' : null
  if (branch) {
    const v = inp[branch]
    if (Array.isArray(v)) followStringRefs(graph, String(v[0]), depth + 1, seen, out, showTextOnly)
    else if (typeof v === 'string' && v.trim()) out.push(v)
    return   // 只走命中的分支，另一个候选不收
  }
}
```

修复后同一张图从"多段场景混排"变为**单条真实进入 CLIP 的文本**。

## 8. 非法 JSON：NaN 消毒

ComfyUI 导出的 prompt 偶发**裸 `NaN`**（如 `"is_changed": [NaN]`），不是合法 JSON，
严格解析直接抛错。处理：

```ts
function safeJsonParse<T>(text: string): T | null {
  try { return JSON.parse(text) } catch {
    try { return JSON.parse(text.replace(/\bNaN\b/g, 'null')) } catch { return null }
  }
}
```

所有对 prompt / workflow 的解析都走这个入口。

## 9. 兜底链（从精确到启发）

按顺序退化，任何一层命中即停：

1. **正/负向条件树收集**（§6，精确）；
2. 任何带 `positive`/`negative` 引用的节点 → 回溯单文本节点；
3. 顺序启发：收集到的第一条当正向，其余当负向；
4. 无采样器的工作流（GPT-Image 等 API 生图）：取全图最长提示词字串；
5. 只有 `workflow`（UI 格式）没有 `prompt` 时：从 `nodes[].widgets_values`
   按 KSampler 固定的槽位顺序（seed, control, steps, cfg, sampler, ...）提取参数。

负向的特殊规则：`ConditioningZeroOut`（负向置零）**直接截断不穿透**——否则会把
正向文本错当负向；双键节点（`negative_prompt` 型）的负向为空就是空，不兜底取正向。

## 10. 已知边界（数据层面不可恢复的信息）

- **通配符运行时解析值不嵌入 PNG**：`DPRandomGenerator.inputs.text` 存的是模板，
  当次随机解析结果只在下游 ShowText 缓存里；若链路上没有 ShowText 缓存，无法逐字还原；
- **LLM 节点输出是"最后一次执行"的缓存**：若工作流多次局部执行，缓存与图片可能
  不对应——这是 PNG 元数据的天然极限，解析器只能保证返回"真实进入 CLIP 的那条"；
- `workflow` 里同一节点的 widgets 顺序因自定义节点而异，兜底提取只覆盖常见 KSampler 布局。

## 11. 验证方式

```bash
npx vitest run tests/meta.test.ts   # 解析回归（63 个用例中的 ComfyUI 部分）
```

新增工作流兼容时，建议把该图 PNG 的 `prompt` 块导出存为 fixture 断言三件事：
**提示词非混排、采样参数与图内采样器一致、负向语义正确**（ConditioningZeroOut → null）。
