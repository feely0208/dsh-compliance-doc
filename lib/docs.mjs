/**
 * 报告解析 + 三份交付文档生成。
 *
 * 输入兼容两种 JSON：
 *   ① 普通扫描报告 { generatedAt, stats, findings[] }（stats 来自 dsh-guard-core）
 *   ② dsh-fix-verify 的 JSON { fixed[], remaining[], regressed[], ... }
 *
 * 输出：自查表.csv / 整改说明.md / 合规证明.md
 *
 * ── 措辞红线 ─────────────────────────────────────────────────────
 * 静态检查只是「把规则库能表达的东西查一遍」，它证明不了合规。
 * 所以三份文件都必须带同一句声明；不得出现「已合规」「保证通过」这类结论。
 */

export const DISCLAIMER =
  '本文件由本地静态检查生成，不构成合规结论，不替代等保测评/监管检查/第三方审计。';

export const NO_HIT_NOTE =
  '未命中不等于没有问题：静态检查只覆盖规则库能表达的判据，配置、流程、人员与实际运行情况仍需人工核查。';

export const PROFILES = ['通用', '等保三级'];

const SEV_LABEL = { critical: '严重', high: '高', medium: '中', low: '低' };
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, unknown: 9 };
const STATUS_ORDER = { 遗留: 0, 新增回归: 0, 待确认: 0, 已修复: 1 };
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export class InputError extends Error {}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

export function severityLabel(sev) {
  return SEV_LABEL[sev] || '未知';
}

function normalizeItem(f, status) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) {
    throw new InputError('findings / 比对结果里存在非对象条目');
  }
  return {
    ruleId: str(f.ruleId || f.id, '(未知规则)'),
    title: str(f.title, '(未命名检查项)'),
    severity: SEV_LABEL[f.severity] ? f.severity : 'unknown',
    source: str(f.source),
    advice: str(f.advice),
    file: str(f.file, '(全局)'),
    line: num(f.line) && num(f.line) > 0 ? num(f.line) : 0,
    status,
  };
}

function countBy(items, keyFn) {
  const out = {};
  for (const it of items) {
    const k = keyFn(it);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export function locationOf(it) {
  return it.line ? `${it.file}:${it.line}` : it.file;
}

/**
 * 把任意一种输入 JSON 归一化成统一的 model。
 * 字段不对直接抛 InputError（CLI 会转成 exit 2）—— 绝不硬编一份看起来正常的文档。
 */
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new InputError('输入 JSON 顶层必须是对象');
  }

  const hasFixShape = ['fixed', 'remaining', 'regressed'].every((k) => Array.isArray(raw[k]));
  const hasScanShape = Array.isArray(raw.findings);

  if (hasFixShape) {
    const remaining = raw.remaining.map((f) => normalizeItem(f, '遗留'));
    const regressed = raw.regressed.map((f) => normalizeItem(f, '新增回归'));
    const fixed = raw.fixed.map((f) => normalizeItem(f, '已修复'));
    const items = [...remaining, ...regressed, ...fixed];
    const ruleIds = new Set(items.map((i) => i.ruleId));
    const pluginSources = Array.isArray(raw.rules?.sources)
      ? raw.rules.sources.map((s) => str(s?.name || s?.short)).filter(Boolean)
      : [];
    return {
      mode: 'fix-verify',
      modeLabel: '改前改后复核',
      generatedAt: str(raw.generatedAt),
      items,
      scannedFiles: num(raw.after?.stats?.scannedFiles),
      beforeScannedFiles: num(raw.before?.stats?.scannedFiles),
      skippedCount: num(raw.after?.stats?.skippedCount),
      rulesCount: num(raw.rules?.total) ?? ruleIds.size,
      pluginSources,
    };
  }

  if (hasScanShape) {
    if (!raw.stats || typeof raw.stats !== 'object' || Array.isArray(raw.stats)) {
      throw new InputError('扫描报告缺少合法的 stats 字段（应为对象）');
    }
    const items = raw.findings.map((f) => normalizeItem(f, '待确认'));
    const ruleIds = new Set(items.map((i) => i.ruleId));
    return {
      mode: 'scan',
      modeLabel: '静态扫描',
      generatedAt: str(raw.generatedAt),
      items,
      scannedFiles: num(raw.stats.scannedFiles),
      beforeScannedFiles: null,
      skippedCount: num(raw.stats.skippedCount),
      rulesCount: num(raw.stats.rulesRun) ?? num(raw.stats.rulesTotal) ?? ruleIds.size,
      pluginSources: [],
    };
  }

  throw new InputError(
    '无法识别的输入：既不是 {generatedAt, stats, findings[]} 扫描报告，' +
    '也不是含 fixed/remaining/regressed 数组的 dsh-fix-verify 报告',
  );
}

/** 在归一化结果上补文档元信息与统计，并按「问题优先 + 严重度」排序 */
export function buildModel(raw, { org = '', date, profile = '通用' } = {}) {
  const base = normalizeReport(raw);
  const items = [...base.items];
  items.sort((a, b) =>
    (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0) ||
    (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.file.localeCompare(b.file));

  const bySeverity = countBy(items, (i) => i.severity);
  const byStatus = countBy(items, (i) => i.status);
  const problems = items.filter((i) => i.status !== '已修复');

  return {
    ...base,
    org: org || '（未填写）',
    date,
    profile,
    items,
    total: items.length,
    problemCount: problems.length,
    fixedCount: byStatus['已修复'] || 0,
    bySeverity,
    byStatus,
  };
}

// ── 自查表.csv ───────────────────────────────────────────────────

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(',');
}

export function buildCsv(model) {
  const lines = ['序号,检查项,严重度,依据,位置,状态,建议'];
  model.items.forEach((it, i) => {
    lines.push(csvRow([
      i + 1,
      it.title,
      severityLabel(it.severity),
      it.source,
      locationOf(it),
      it.status,
      it.advice,
    ]));
  });
  if (!model.items.length) {
    lines.push(csvRow(['', '本次检查未发现提示项（未命中不等于没有问题）', '', '', '', '—', NO_HIT_NOTE]));
  }
  lines.push(csvRow(['', '【声明】' + DISCLAIMER, '', '', '', '仅供参考', '']));
  // UTF-8 BOM：Excel 直接双击打开不乱码
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

// ── 整改说明.md ──────────────────────────────────────────────────

function metaLines(model) {
  const L = [];
  L.push(`- 单位 / 组织：${model.org}`);
  L.push(`- 检查日期：${model.date}`);
  L.push(`- 检查方式：${model.modeLabel}（本地静态检查，不联网、不执行被检代码）`);
  L.push(`- 文档生成时间：${new Date().toISOString()}`);
  if (model.generatedAt) L.push(`- 报告生成时间：${model.generatedAt}`);
  L.push(`- 文档档次（profile）：${model.profile}`);
  return L;
}

function problemItems(model) {
  return model.items.filter((i) => i.status !== '已修复');
}

function renderItem(it, idx) {
  const L = [];
  L.push(`### ${idx}. [${severityLabel(it.severity)}] ${it.title}`, '');
  L.push(`- 规则：\`${it.ruleId}\``);
  L.push(`- 位置：\`${locationOf(it)}\``);
  L.push(`- 状态：${it.status}`);
  L.push(`- 依据：${it.source || '（该检查项未提供依据文本）'}`);
  L.push(`- 整改建议：${it.advice || '（该检查项未提供整改建议，请按规则依据人工确认）'}`);
  L.push('');
  return L.join('\n');
}

export function buildRectificationMd(model) {
  const L = [];
  L.push('# 整改说明', '');
  L.push('> **声明**：' + DISCLAIMER, '');
  L.push('## 文档信息', '');
  L.push(metaLines(model).join('\n'));
  L.push('');
  L.push('## 一、背景', '');
  if (model.mode === 'fix-verify') {
    L.push('本说明依据一次「改前改后复核」的本地静态检查结果整理：对同一项目的旧快照与新快照运行同一套规则，' +
      '逐条比对两次结果，区分已修复、遗留与新增回归项。');
  } else {
    L.push('本说明依据一次本地静态检查结果整理：使用深鲸守护插件提供的规则，对目标项目做只读扫描，' +
      '把命中的提示项汇总成可跟踪的整改清单。');
  }
  L.push('静态检查的作用是**提示需要确认的位置**，不是判定违规；本说明也不对合规状态作结论。');
  L.push('');
  L.push('## 二、检查范围与方法', '');
  const scope = [];
  if (model.scannedFiles != null) scope.push(`扫描文件 ${model.scannedFiles} 个（跳过非文本 ${model.skippedCount ?? 0} 个）`);
  if (model.mode === 'fix-verify' && model.beforeScannedFiles != null) {
    scope.push(`旧快照 ${model.beforeScannedFiles} 个文件、新快照 ${model.scannedFiles} 个文件`);
  }
  scope.push(`运行规则 ${model.rulesCount} 条`);
  if (model.pluginSources.length) scope.push(`规则来源插件：${model.pluginSources.join('、')}`);
  L.push('- ' + scope.join('；'));
  L.push('- 方法：只读遍历文件内容并按规则匹配，不联网、不执行被检代码、不上传任何文件；' +
    '每条提示项都带「文件:行号」定位与规则依据，便于逐条核对。');
  if (model.profile === '等保三级') {
    L.push('- 说明：文档按「等保三级」关注点组织呈现，但规则集不变，本文件**不构成等保测评结论**。');
  }
  L.push('- 扫描范围只覆盖文本类文件；被扫描器跳过的目录（node_modules、dist 等）不在本次范围。');
  L.push('');
  L.push('## 三、发现的问题与整改建议', '');
  const problems = problemItems(model);
  if (!problems.length) {
    L.push(model.mode === 'fix-verify'
      ? '改后快照未发现提示项（遗留与新增回归均为 0）。'
      : '本次静态检查未发现提示项。');
    L.push('');
    L.push('> ' + NO_HIT_NOTE);
  } else {
    L.push(`本次共整理 ${problems.length} 个提示项，按严重度从高到低列出：`);
    L.push('');
    problems.forEach((it, i) => L.push(renderItem(it, i + 1)));
  }
  L.push('');
  const fixed = model.items.filter((i) => i.status === '已修复');
  L.push('## 四、本轮已修复项（不计入待整改）', '');
  if (!fixed.length) {
    L.push('无。');
  } else {
    L.push(`本轮复核确认 ${fixed.length} 项在改后快照中已不再命中：`);
    L.push('');
    fixed.forEach((it, i) => {
      L.push(`${i + 1}. [${severityLabel(it.severity)}] ${it.title}（\`${it.ruleId}\`，\`${locationOf(it)}\`）—— 改后快照未再命中`);
    });
  }
  L.push('');
  L.push('## 五、复核方式', '');
  L.push('1. **重新跑一遍扫描**：用同一套规则、同一扫描范围重新生成报告；');
  L.push('2. **改前改后对比**：用 `dsh-fix-verify --before <旧快照> --after <新快照>` 复核，' +
    '确认「遗留」与「新增回归」是否归零；');
  L.push('3. **逐条对照**：把新报告与本说明第三章逐条比对，确认状态是否由「遗留 / 待确认」变为「已修复」；');
  L.push('4. **留痕**：旧报告、新报告与本说明一并归档，作为整改过程的证据；');
  L.push('5. **人工复核**：规则覆盖不到的管理制度、流程、人员与运行情况，仍需人工核查。');
  L.push('');
  L.push('## 六、声明', '');
  L.push('> ' + DISCLAIMER);
  L.push('>');
  L.push('> ' + NO_HIT_NOTE);
  L.push('');
  return L.join('\n');
}

// ── 合规证明.md ──────────────────────────────────────────────────

function uniqueSources(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const s = it.source.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function conclusionText(model) {
  const rules = model.rulesCount ?? 0;
  const files = model.scannedFiles ?? 0;
  if (model.problemCount === 0) {
    const extra = (model.mode === 'fix-verify' && model.fixedCount)
      ? ` 本轮复核另确认已修复 ${model.fixedCount} 项。`
      : '';
    return [
      `本次检查覆盖 ${rules} 条规则、${files} 个文件，未发现提示项。` + extra,
      '',
      '**措辞边界**：上述表述仅指本次静态检查在其规则覆盖范围内没有报出提示项。' +
      '未命中不等于没有问题；' + DISCLAIMER,
    ].join('\n');
  }
  if (model.mode === 'fix-verify') {
    return [
      `本轮复核结果：已修复 ${model.fixedCount} 项，遗留 ${model.byStatus['遗留'] || 0} 项，` +
      `新增回归 ${model.byStatus['新增回归'] || 0} 项。`,
      '',
      '**措辞边界**：上述数字只描述同一套规则在改前/改后两份快照上的比对结果，' +
      '不代表项目整体安全或合规状态。' + DISCLAIMER,
    ].join('\n');
  }
  const sev = SEVERITIES
    .filter((s) => model.bySeverity[s])
    .map((s) => `${severityLabel(s)} ${model.bySeverity[s]} 项`)
    .join('、');
  return [
    `本次检查覆盖 ${rules} 条规则、${files} 个文件，共发现 ${model.total} 个提示项` +
    (sev ? `（${sev}）` : '') + '，已逐条列入《整改说明.md》。',
    '',
    '**措辞边界**：上述结果只是静态检查提示，不是违规判定，也不代表项目整体合规状态。' +
    '在完成整改与人工复核前，不应引用本文件作为合规结论。' + DISCLAIMER,
  ].join('\n');
}

export function buildAttestationMd(model) {
  const L = [];
  L.push('# 合规证明', '');
  L.push('> **声明**：' + DISCLAIMER, '');
  L.push('## 一、检查范围', '');
  L.push(metaLines(model).join('\n'));
  L.push('');
  L.push('本次检查的对象与边界：');
  L.push('');
  L.push(`- 扫描文件数：${model.scannedFiles ?? '未提供'}` +
    (model.mode === 'fix-verify' && model.beforeScannedFiles != null
      ? `（旧快照 ${model.beforeScannedFiles} 个）`
      : ''));
  L.push('- 扫描方式：本地只读静态检查，不联网、不执行被检代码、不上传文件；');
  L.push('- 规则来源：深鲸守护插件规则库（可在报告中核对每条规则 ID 与依据）；');
  if (model.profile === '等保三级') {
    L.push('- 文档档次：等保三级（仅影响文档组织方式，**不构成等保测评结论**）');
  }
  L.push('');
  L.push('## 二、检查方法与规则条数', '');
  L.push(`- 运行规则：${model.rulesCount ?? 0} 条`);
  if (model.pluginSources.length) L.push(`- 规则来源插件：${model.pluginSources.join('、')}`);
  L.push('- 判定方法：逐文件匹配规则库中的判据；命中项输出文件、行号、依据与建议；');
  L.push('- 规则未命中不代表该项目不存在问题 —— 静态规则只能覆盖可文本化、可自动化的判据。');
  L.push('');
  L.push('## 三、依据清单（去重）', '');
  const sources = uniqueSources(model.items);
  if (!sources.length) {
    L.push('本次检查未发现提示项，无对应依据条目。');
  } else {
    sources.forEach((s, i) => L.push(`${i + 1}. ${s}`));
  }
  L.push('');
  L.push('## 四、检查结果', '');
  if (model.problemCount === 0) {
    L.push(`本次检查覆盖 ${model.rulesCount ?? 0} 条规则、${model.scannedFiles ?? 0} 个文件，未发现提示项。`);
    if (model.mode === 'fix-verify' && model.fixedCount) {
      L.push('');
      L.push(`本轮复核另确认已修复 ${model.fixedCount} 项（改后快照不再命中）。`);
    }
    L.push('');
    L.push('> ' + NO_HIT_NOTE);
  } else if (model.mode === 'fix-verify') {
    L.push(`- 已修复：${model.fixedCount} 项`);
    L.push(`- 遗留：${model.byStatus['遗留'] || 0} 项`);
    L.push(`- 新增回归：${model.byStatus['新增回归'] || 0} 项`);
    L.push('');
    L.push('> 逐条明细见《整改说明.md》。');
  } else {
    L.push(`- 提示项合计：${model.total} 项`);
    L.push(`- 按状态：${Object.entries(model.byStatus).map(([k, v]) => `${k} ${v} 项`).join('、')}`);
    L.push(`- 按严重度：${SEVERITIES.filter((s) => model.bySeverity[s]).map((s) => `${severityLabel(s)} ${model.bySeverity[s]} 项`).join('、') || '—'}`);
    L.push('');
    L.push('> 逐条明细与整改建议见《整改说明.md》，清单见《自查表.csv》。');
  }
  L.push('');
  L.push('## 五、结论措辞', '');
  L.push(conclusionText(model));
  L.push('');
  L.push('---', '');
  L.push('本文件为机器生成的检查记录，可作为内部自查材料归档；对外提交前请由责任人核对并补充人工复核意见。');
  L.push('');
  return L.join('\n');
}

/** 生成三份文件：文件名 -> 内容 */
export function buildDocuments(model) {
  return {
    '自查表.csv': buildCsv(model),
    '整改说明.md': buildRectificationMd(model),
    '合规证明.md': buildAttestationMd(model),
  };
}
