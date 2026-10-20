#!/usr/bin/env node
/**
 * dsh-compliance-doc —— 合规可交付文档
 *
 * 吃一份本地静态检查报告（普通扫描报告 或 dsh-fix-verify 的 JSON），
 * 吐出三份能直接交出去的文件：
 *   自查表.csv       Excel 直接打开（UTF-8 BOM）
 *   整改说明.md      背景 / 范围 / 逐条问题与整改建议 / 复核方式
 *   合规证明.md      范围 / 规则条数 / 依据清单 / 结论措辞
 *
 * 措辞红线：三份文件都写明「本文件由本地静态检查生成，不构成合规结论，
 * 不替代等保测评/监管检查/第三方审计」，不写「已合规」「保证通过」。
 *
 * 退出码：
 *   0  正常
 *   2  输入缺失 / JSON 解析失败 / 字段不对 / 参数错误
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocuments, buildModel, DISCLAIMER, InputError, NO_HIT_NOTE, PROFILES, severityLabel } from '../lib/docs.mjs';

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
const TOOL = 'dsh-compliance-doc';

function usage() {
  console.log(`
  ${TOOL} v${pkg.version} · 合规可交付文档

  ${pkg.description}

  用法：
    dsh-compliance-doc --input <报告.json> --out <输出目录> [选项]

  选项：
    --input <file>       输入 JSON：普通扫描报告，或 dsh-fix-verify 的 --json 输出（必填）
    --out <dir>          输出目录（不存在会自动创建，必填）
    --profile <档次>     文档档次：通用（默认）| 等保三级
    --org "<公司名>"     文档里的单位 / 组织名称
    --date <YYYY-MM-DD>  检查日期（默认今天）
    --quiet              只输出一行结果
    -h, --help           显示帮助

  生成的三份文件：
    自查表.csv      序号 / 检查项 / 严重度 / 依据 / 位置 / 状态 / 建议（UTF-8 BOM，Excel 可直接打开）
    整改说明.md     背景 / 检查范围与方法 / 逐条问题与整改建议 / 复核方式
    合规证明.md     检查范围 / 规则条数 / 依据清单（去重）/ 结论措辞

  措辞边界：
    三份文件都会写明「本文件由本地静态检查生成，不构成合规结论，
    不替代等保测评/监管检查/第三方审计」。静态检查不是合规认证。

  退出码：
    0  正常生成
    2  输入缺失 / JSON 解析失败 / 字段不对 / 参数错误
`);
}

function die(msg) {
  console.error(`\n  ❌ ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opt = { input: null, out: null, profile: '通用', org: '', date: null, quiet: false, help: false };
  const need = (a, i) => {
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) die(`参数 ${a} 缺少值`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') { opt.input = need(a, i); i++; }
    else if (a === '--out') { opt.out = need(a, i); i++; }
    else if (a === '--profile') { opt.profile = need(a, i); i++; }
    else if (a === '--org') { opt.org = need(a, i); i++; }
    else if (a === '--date') { opt.date = need(a, i); i++; }
    else if (a === '--quiet') opt.quiet = true;
    else if (a === '-h' || a === '--help') opt.help = true;
    else die(`未知参数：${a}（用 --help 看用法）`);
  }
  return opt;
}

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

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (opt.help) { usage(); process.exit(0); }

  if (!opt.input) die('缺少 --input <报告.json>');
  if (!opt.out) die('缺少 --out <输出目录>');
  if (!PROFILES.includes(opt.profile)) {
    die(`--profile 只支持：${PROFILES.join(' | ')}（收到：${opt.profile}）`);
  }
  const date = opt.date || todayLocal();
  if (!validDate(date)) die(`--date 不是合法日期（应为 YYYY-MM-DD）：${date}`);

  const inputPath = resolve(opt.input);
  if (!isFile(inputPath)) die(`输入文件不存在：${inputPath}`);

  let raw;
  try {
    raw = JSON.parse(readFileSync(inputPath, 'utf-8'));
  } catch (e) {
    die(`输入 JSON 解析失败：${inputPath}\n     ${e && e.message}`);
  }

  let model;
  try {
    model = buildModel(raw, { org: opt.org, date, profile: opt.profile });
  } catch (e) {
    if (e instanceof InputError) die(`输入字段不对：${e.message}`);
    die(`生成文档前处理输入失败：${e && e.message}`);
  }

  const outDir = resolve(opt.out);
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (e) {
    die(`无法创建输出目录：${outDir}（${e && e.message}）`);
  }

  const docs = buildDocuments(model);
  const written = [];
  for (const [name, content] of Object.entries(docs)) {
    const full = join(outDir, name);
    try {
      writeFileSync(full, content, 'utf-8');
      written.push({ name, full });
    } catch (e) {
      die(`写入失败：${full}（${e && e.message}）`);
    }
  }

  const ruleCount = model.rulesCount ?? 0;
  const fileCount = model.scannedFiles ?? 0;

  const countLabel = model.mode === 'fix-verify'
    ? `已修复 ${model.fixedCount} / 遗留 ${model.byStatus['遗留'] || 0} / 新增回归 ${model.byStatus['新增回归'] || 0}`
    : `提示项 ${model.total} 条`;
  const inputLabel = model.mode === 'fix-verify'
    ? `${model.total} 条比对记录`
    : `${model.total} 条提示项`;

  if (opt.quiet) {
    console.log(`已生成 ${written.length} 份文件 → ${outDir}（${countLabel} / 规则 ${ruleCount} 条 / 文件 ${fileCount} 个）`);
  } else {
    console.log(`\n  ${TOOL} v${pkg.version} · 合规可交付文档`);
    console.log('  ────────────────────────────────────────────────');
    console.log(`  输入    ${inputPath}（${model.modeLabel} · ${inputLabel}）`);
    console.log(`  输出    ${outDir}`);
    console.log('');
    console.log('  ✅ 自查表.csv        ' + (model.total ? `${model.total} 条检查项，Excel 可直接打开` : '0 条提示项（含说明行）'));
    console.log('  ✅ 整改说明.md       背景 / 范围与方法 / 逐条问题与建议 / 复核方式');
    console.log('  ✅ 合规证明.md       范围 / 规则条数 / 依据清单 / 结论措辞');
    console.log('');
    console.log(`  扫描    ${fileCount} 个文件 · 运行规则 ${ruleCount} 条`);
    if (model.mode === 'fix-verify') {
      console.log(`  复核    ${countLabel}`);
    } else if (model.total) {
      const sev = ['critical', 'high', 'medium', 'low']
        .filter((s) => model.bySeverity[s])
        .map((s) => `${severityLabel(s)} ${model.bySeverity[s]}`)
        .join(' · ');
      console.log(`  提示项  ${model.total} 条${sev ? `（${sev}）` : ''}`);
    } else {
      console.log('  提示项  0 条 —— 但未命中不等于没有问题');
    }
    console.log('');
    console.log(`  > ${DISCLAIMER}`);
    console.log(`  > ${NO_HIT_NOTE}`);
    console.log('');
  }

  process.exit(0);
}

main();
