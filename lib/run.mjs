/**
 * 面板后端用的无退出码版本：与 bin/cli.mjs 共用 lib/docs.mjs，
 * 但不 process.exit、不打印，返回结构化结果。
 * CLI 行为保持不变。
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { buildDocuments, buildModel, DISCLAIMER, InputError, NO_HIT_NOTE, PROFILES } from './docs.mjs';

function todayLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

export function runPanel(opts = {}) {
  const input = String(opts.input || '').trim();
  let out = String(opts.out || '').trim();
  const profile = String(opts.profile || '通用').trim() || '通用';
  const org = String(opts.org || '').trim();
  const date = String(opts.date || '').trim() || todayLocal();

  if (!input) return { ok: false, text: '请填写报告 JSON 路径（扫描报告或 dsh-fix-verify 的 --json 输出）' };
  if (!out) out = join(dirname(String(input)), '合规文书');
  if (!PROFILES.includes(profile)) return { ok: false, text: `文档档次只支持：${PROFILES.join(' | ')}` };
  if (!validDate(date)) return { ok: false, text: `日期不是合法 YYYY-MM-DD：${date}` };

  const inputPath = resolve(input);
  if (!isFile(inputPath)) return { ok: false, text: '输入文件不存在：' + inputPath };

  let raw;
  try { raw = JSON.parse(readFileSync(inputPath, 'utf-8')); }
  catch (e) { return { ok: false, text: `输入 JSON 解析失败：${e?.message || e}` }; }

  let model;
  try { model = buildModel(raw, { org, date, profile }); }
  catch (e) {
    if (e instanceof InputError) return { ok: false, text: '输入字段不对：' + e.message };
    return { ok: false, text: '生成文档前处理输入失败：' + (e?.message || e) };
  }

  const outDir = resolve(out);
  try { mkdirSync(outDir, { recursive: true }); }
  catch (e) { return { ok: false, text: `无法创建输出目录：${outDir}（${e?.message || e}）` }; }

  const docs = buildDocuments(model);
  const written = [];
  for (const [name, content] of Object.entries(docs)) {
    const full = join(outDir, name);
    try {
      writeFileSync(full, content, 'utf-8');
      written.push({ name, path: full });
    } catch (e) {
      return { ok: false, text: `写入失败：${full}（${e?.message || e}）` };
    }
  }

  const countLabel = model.mode === 'fix-verify'
    ? `已修复 ${model.fixedCount} / 遗留 ${model.byStatus['遗留'] || 0} / 新增回归 ${model.byStatus['新增回归'] || 0}`
    : `提示项 ${model.total} 条`;

  const lines = [
    `已生成 ${written.length} 份文件 → ${outDir}`,
    `  输入 ${inputPath}（${model.modeLabel}）`,
    `  结果 ${countLabel} · 规则 ${model.rulesCount ?? 0} 条 · 文件 ${model.scannedFiles ?? 0} 个`,
    '',
    ...written.map((w) => `  ✅ ${w.name}  ${w.path}`),
    '',
    '> ' + DISCLAIMER,
    '> ' + NO_HIT_NOTE,
  ];

  return {
    ok: true,
    text: lines.join('\n'),
    outputs: { dir: outDir, files: written },
    model: { mode: model.mode, total: model.total, rulesCount: model.rulesCount ?? 0, scannedFiles: model.scannedFiles ?? 0 },
  };
}
