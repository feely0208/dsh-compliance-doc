#!/bin/bash
# dsh-compliance-doc · 真行为验证
#
# 验证三份文件真的生成、章节与免责声明真的存在、0 命中 wording 正确、
# 两种输入形态（扫描报告 / fix-verify）都能吃、坏输入必须 exit 2。
set -uo pipefail
export PATH="/usr/local/bin:$PATH"
cd "$(dirname "$0")/.."
ROOT="$PWD"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo ""; echo "  $(node -p "require('./package.json').name") · 可交付文档验证"
echo "  ────────────────────────────────────────────────"

TMP=$(mktemp -d "$ROOT/tests/.tmp.XXXXXX") || { echo "无法创建临时目录"; exit 1; }
trap 'rm -rf "$TMP"' EXIT
CLI="$ROOT/bin/cli.mjs"
DISCLAIMER="本文件由本地静态检查生成，不构成合规结论，不替代等保测评/监管检查/第三方审计。"

# 0) 不应该有 rules/ 目录（本插件不新增判据）
[ ! -d rules ] && ok "本插件没有 rules/ 目录（不新增判据）" || bad "不应存在 rules/ 目录"

# ── 1) 普通扫描报告 → 三份文件 ─────────────────────────────────
echo ""; echo "  【1】普通扫描报告（findings + stats）"
OUT1="$TMP/out1"
node "$CLI" --input tests/fixtures/report.json --out "$OUT1" \
  --org "测试科技有限公司" --date "2026-01-02" >"$TMP/o1" 2>&1
E1=$?
[ "$E1" = "0" ] && ok "正常生成 exit 0（实际 ${E1}）" || bad "应 exit 0，实际 $E1"
for f in 自查表.csv 整改说明.md 合规证明.md; do
  [ -s "$OUT1/$f" ] && ok "生成非空 $f" || bad "缺少 $f"
done

# CSV：BOM + 表头 + 3 条数据 + 声明行 + 7 列
python3 - "$OUT1/自查表.csv" <<'PY' && ok "CSV：UTF-8 BOM、表头、3 条数据、7 列、声明行" || bad "CSV 结构不符合要求"
import csv, sys
raw = open(sys.argv[1], encoding='utf-8').read()
assert raw.startswith('\ufeff'), '缺少 UTF-8 BOM'
rows = list(csv.reader(open(sys.argv[1], encoding='utf-8-sig')))
assert rows[0] == ['序号','检查项','严重度','依据','位置','状态','建议'], rows[0]
assert all(len(r) == 7 for r in rows), [len(r) for r in rows]
data = [r for r in rows[1:] if r[0].isdigit()]
assert len(data) == 3, data
assert [r[5] for r in data] == ['待确认','待确认','待确认']
assert data[0][6], '建议列为空'
assert any('不构成合规结论' in r[1] for r in rows), 'CSV 缺免责声明行'
assert any('明文密钥' in r[1] and ',' in r[1] for r in data) or any('，' in r[1] for r in data)
PY

# 整改说明：规定的章节与逐条建议
for kw in "背景" "检查范围与方法" "发现的问题与整改建议" "整改建议" "复核方式" "不构成合规结论"; do
  grep -q "$kw" "$OUT1/整改说明.md" && ok "整改说明含「${kw}」" || bad "整改说明缺「${kw}」"
done
for rid in DEMO-KEY-PLAIN DEMO-LOG-RETENTION DEMO-README-MISSING; do
  grep -q "$rid" "$OUT1/整改说明.md" && ok "整改说明逐条列出 $rid" || bad "整改说明缺 $rid"
done
grep -q "测试科技有限公司" "$OUT1/整改说明.md" && ok "--org 写入整改说明" || bad "--org 未写入"
grep -q "2026-01-02" "$OUT1/整改说明.md" && ok "--date 写入整改说明" || bad "--date 未写入"

# 合规证明：范围 / 规则条数 / 依据清单（去重） / 结论措辞
for kw in "检查范围" "检查方法与规则条数" "依据清单" "检查结果" "结论措辞" "不构成合规结论"; do
  grep -q "$kw" "$OUT1/合规证明.md" && ok "合规证明含「${kw}」" || bad "合规证明缺「${kw}」"
done
grep -q "运行规则：12 条" "$OUT1/合规证明.md" && ok "合规证明写明规则条数 12" || bad "规则条数缺失"
grep -q "扫描文件数：34" "$OUT1/合规证明.md" && ok "合规证明写明扫描文件数 34" || bad "扫描文件数缺失"
N=$(python3 - "$OUT1/合规证明.md" <<'PY'
import re,sys
t=open(sys.argv[1],encoding='utf-8').read()
sec=t.split('## 三、依据清单（去重）',1)[1].split('## 四、',1)[0]
print(len(re.findall(r'^\d+\. ', sec, re.M)))
PY
)
[ "$N" = "3" ] && ok "依据清单去重后 3 条（3 个不同依据）" || bad "依据清单条数错误：${N:-空}"

# 三份文件都必须带免责声明，且不得出现「已合规 / 保证通过」
for f in 自查表.csv 整改说明.md 合规证明.md; do
  grep -q "不构成合规结论" "$OUT1/$f" && ok "$f 含免责声明" || bad "$f 缺免责声明"
done
HIT=0
for w in "已合规" "保证通过" "绝对合规" "通过等保"; do
  grep -q "$w" "$OUT1"/* 2>/dev/null && { bad "出现违禁措辞「${w}」"; HIT=1; }
done
[ "$HIT" = "0" ] && ok "三份文件无「已合规 / 保证通过」类措辞"

# ── 2) 0 命中样本 → 规定 wording ───────────────────────────────
echo ""; echo "  【2】0 命中样本"
OUT2="$TMP/out2"
node "$CLI" --input tests/fixtures/report-empty.json --out "$OUT2" --quiet >"$TMP/o2" 2>&1
E2=$?
[ "$E2" = "0" ] && ok "0 命中样本正常生成 exit 0" || bad "应 exit 0，实际 $E2"
grep -q "本次检查覆盖 12 条规则、34 个文件，未发现提示项" "$OUT2/合规证明.md" \
  && ok "合规证明写明「本次检查覆盖 12 条规则、34 个文件，未发现提示项」" \
  || bad "0 命中 wording 不符合要求"
grep -q "未命中不等于没有问题" "$OUT2/合规证明.md" \
  && ok "合规证明提醒「未命中不等于没有问题」" || bad "缺「未命中不等于没有问题」"
grep -q "本次检查未发现提示项" "$OUT2/自查表.csv" \
  && ok "0 命中时自查表仍有说明行" || bad "0 命中时自查表缺说明行"
grep -q "未发现提示项" "$OUT2/整改说明.md" \
  && ok "0 命中时整改说明写明未发现提示项" || bad "整改说明缺未发现提示项"

# ── 3) fix-verify JSON 输入 ───────────────────────────────────
echo ""; echo "  【3】dsh-fix-verify 报告输入"
OUT3="$TMP/out3"
node "$CLI" --input tests/fixtures/fix-verify-report.json --out "$OUT3" \
  --profile 等保三级 --org "测试科技有限公司" --date "2026-10-20" --quiet >"$TMP/o3" 2>&1
E3=$?
[ "$E3" = "0" ] && ok "fix-verify 报告正常生成 exit 0" || bad "应 exit 0，实际 $E3"
python3 - "$OUT3/自查表.csv" <<'PY' && ok "CSV 状态列正确区分 遗留 / 新增回归 / 已修复" || bad "fix-verify CSV 状态列错误"
import csv,sys
rows=list(csv.reader(open(sys.argv[1],encoding='utf-8-sig')))
data=[r for r in rows[1:] if r[0].isdigit()]
assert sorted(r[5] for r in data)==['已修复','新增回归','遗留'], [r[5] for r in data]
PY
grep -q "已修复：1 项" "$OUT3/合规证明.md" && ok "合规证明统计已修复 1 项" || bad "已修复统计缺失"
grep -q "遗留：1 项" "$OUT3/合规证明.md" && ok "合规证明统计遗留 1 项" || bad "遗留统计缺失"
grep -q "新增回归：1 项" "$OUT3/合规证明.md" && ok "合规证明统计新增回归 1 项" || bad "新增回归统计缺失"
grep -q "本轮已修复项" "$OUT3/整改说明.md" && grep -q "改后快照" "$OUT3/整改说明.md" \
  && ok "整改说明区分「本轮已修复项」" || bad "整改说明未区分已修复项"
grep -q "不构成等保测评结论" "$OUT3/合规证明.md" && ok "等保三级 profile 写明不构成等保测评结论" || bad "等保三级声明缺失"

# ── 4) 坏输入 → exit 2 ────────────────────────────────────────
echo ""; echo "  【4】坏输入必须 exit 2（不硬编一份看起来正常的文档）"
node "$CLI" --input /nonexistent-xyz.json --out "$TMP/x1" >/dev/null 2>&1
[ "$?" = "2" ] && ok "输入文件不存在 → exit 2" || bad "输入不存在应 exit 2"
node "$CLI" --input tests/fixtures/malformed.json --out "$TMP/x2" >/dev/null 2>&1
[ "$?" = "2" ] && ok "JSON 解析失败 → exit 2" || bad "坏 JSON 应 exit 2"
node "$CLI" --input tests/fixtures/bad-stats.json --out "$TMP/x3" >/dev/null 2>&1
[ "$?" = "2" ] && ok "字段不对（stats 不是对象）→ exit 2" || bad "字段不对应 exit 2"
node "$CLI" --input tests/fixtures/report.json >/dev/null 2>&1
[ "$?" = "2" ] && ok "缺 --out → exit 2" || bad "缺 --out 应 exit 2"
node "$CLI" --out "$TMP/x4" >/dev/null 2>&1
[ "$?" = "2" ] && ok "缺 --input → exit 2" || bad "缺 --input 应 exit 2"
node "$CLI" --input tests/fixtures/report.json --out "$TMP/x5" --profile 不存在 >/dev/null 2>&1
[ "$?" = "2" ] && ok "非法 --profile → exit 2" || bad "非法 profile 应 exit 2"
node "$CLI" --input tests/fixtures/report.json --out "$TMP/x6" --date 2026-02-31 >/dev/null 2>&1
[ "$?" = "2" ] && ok "非法 --date → exit 2" || bad "非法日期应 exit 2"

# ── 5) --out 目录不存在时自动创建 ─────────────────────────────
echo ""; echo "  【5】--out 自动建目录 + --help"
node "$CLI" --input tests/fixtures/report-empty.json --out "$TMP/a/b/c" --quiet >/dev/null 2>&1
[ -f "$TMP/a/b/c/合规证明.md" ] && ok "嵌套输出目录自动创建" || bad "输出目录未自动创建"
node "$CLI" --help >"$TMP/help" 2>&1
[ "$?" = "0" ] && ok "--help exit 0" || bad "--help 退出码异常"
grep -q "退出码" "$TMP/help" && ok "--help 写明了退出码" || bad "--help 缺退出码"
grep -q "不构成合规结论" "$TMP/help" && ok "--help 写明措辞边界" || bad "--help 缺措辞边界"

# ── 6) 自带的规则源发现器可独立工作 ───────────────────────────
echo ""; echo "  【6】内置 lib/discover.mjs（不依赖其它插件 import）"
node --input-type=module -e "
import { discoverRuleSources } from '$ROOT/lib/discover.mjs';
const r = discoverRuleSources({ pkgRoot: '$ROOT', extraDirs: ['$ROOT/tests/fixtures/fake-plugins'] });
const fake = r.sources.find((s) => s.short === 'fake-b');
if (!fake) { console.error('未发现 fake-b'); process.exit(1); }
if (fake.rules[0]._plugin !== 'fake-b') { console.error('_plugin 注入失败'); process.exit(1); }
console.log('ok');
" >"$TMP/discover" 2>&1
[ "$?" = "0" ] && ok "discover 发现 fake-b 并注入 _plugin=fake-b" || bad "discover 工作异常：$(cat "$TMP/discover" | head -3)"

# ── 7) 面板后端（v0.2.0 加的 lib/run.mjs，与 CLI 共用 docs.mjs）─────
echo ""; echo "  【7】面板后端 runPanel()"
node --input-type=module -e "
import { runPanel } from '$ROOT/lib/run.mjs';
const r = runPanel({ input: '$ROOT/tests/fixtures/report.json', out: '$TMP/panel', profile: '等保三级', org: '测试科技有限公司', date: '2026-10-29' });
if (!r.ok) { console.error('面板后端失败', r.text); process.exit(1); }
if (r.outputs.files.length !== 3) { console.error('产物数量不对', r.outputs.files); process.exit(1); }
const names = r.outputs.files.map((f) => f.name).sort().join(',');
if (names !== ['合规证明.md','整改说明.md','自查表.csv'].sort().join(',')) { console.error('产物名不对', names); process.exit(1); }
if (!r.text.includes('不构成合规结论')) { console.error('缺声明'); process.exit(1); }
" >"$TMP/panel.log" 2>&1
[ "$?" = "0" ] && ok "面板后端生成三份文件并带声明" || bad "面板后端异常：$(head -3 "$TMP/panel.log")"

node --input-type=module -e "
import { runPanel } from '$ROOT/lib/run.mjs';
const a = runPanel({ input: '', out: '' });
const b = runPanel({ input: '$ROOT/tests/fixtures/malformed.json', out: '$TMP/px' });
if (a.ok || b.ok) { console.error('坏输入未报错', a.ok, b.ok); process.exit(1); }
" >"$TMP/panel2.log" 2>&1
[ "$?" = "0" ] && ok "面板后端坏输入优雅报错（不抛异常/不白屏）" || bad "面板后端坏输入处理异常：$(head -3 "$TMP/panel2.log")"

echo ""
echo "  ────────────────────────────────────────────────"
echo "  通过 $PASS · 失败 $FAIL"; echo ""
[ "$FAIL" -eq 0 ] || exit 1
