# 合规可交付文档（dsh-compliance-doc）

**什么时候用**：安全检查已经跑完，要把结果整理成能交出去的文档。
用户会说：「出一份自查表」「写个整改说明」「做一份合规证明」「报告要给领导 / 客户 / 测评机构看」
「扫描结果导出成 Excel」「整改完要留个记录」。

## 怎么用

```bash
<cli 路径> --input <报告.json> --out <输出目录>                       # 三份文件
<cli 路径> --input <报告.json> --out <目录> --org "公司名"             # 写上单位
<cli 路径> --input <报告.json> --out <目录> --date 2026-10-20          # 指定检查日期
<cli 路径> --input <报告.json> --out <目录> --profile 等保三级          # 文档档次
<cli 路径> --input <报告.json> --out <目录> --quiet                   # 只输出一行结果
```

输入有两种来源：

```bash
# ① 普通 / suite 扫描报告（{ generatedAt, stats, findings[] }）
<cli 路径> --input report.json --out ./交付

# ② dsh-fix-verify 的 --json 输出（含 fixed / remaining / regressed）
dsh-fix-verify --before old --after new --json > fix-verify.json
<cli 路径> --input fix-verify.json --out ./交付
```

## 生成什么

| 文件 | 内容 |
|---|---|
| `自查表.csv` | 序号 / 检查项 / 严重度 / 依据 / 位置 / 状态 / 建议；UTF-8 BOM，Excel 直接打开 |
| `整改说明.md` | 背景 / 检查范围与方法 / 逐条问题与整改建议 / 复核方式说明 |
| `合规证明.md` | 检查范围 / 规则条数 / 依据清单（去重）/ 结论措辞 |

fix-verify 输入时，状态列会区分「已修复 / 遗留 / 新增回归」；
整改说明会单列「本轮已修复项」，不和待整改问题混在一起。

## 输入格式

**扫描报告**：必须有 `findings` 数组和 `stats` 对象（`scannedFiles`、`rulesRun` 等来自
`dsh-guard-core`）。0 命中就是 `findings: []`。

**fix-verify 报告**：顶层有 `fixed` / `remaining` / `regressed` 三个数组；
文件数取自 `after.stats.scannedFiles`，规则数取自 `rules.total`。

字段不对、JSON 解析失败、输入不存在 → **exit 2**（不会生成半份假文档）。

## 退出码

| 码 | 含义 |
|---|---|
| `0` | 三份文件正常生成 |
| `2` | 输入缺失 / JSON 解析失败 / 字段不对 / 参数错误（含非法 profile、非法日期） |

## 措辞边界（必须保留）

三份文件都会写明：

> 本文件由本地静态检查生成，不构成合规结论，不替代等保测评/监管检查/第三方审计。

- 0 命中时写「本次检查覆盖 N 条规则、M 个文件，未发现提示项」，并提醒「未命中不等于没有问题」；
- 不写「已合规」「保证通过」；
- `--profile 等保三级` 只改变文档组织方式，不构成等保测评结论。

## 不要做什么

- 不要把生成的 `合规证明.md` 当合规证书用
- 不要删掉免责声明或把「提示项」改写成「违规项」
- 不要用它代替人工复核与真实测评
- 不要在没有扫描报告时手编输入 —— 先用扫描插件 / `dsh-fix-verify` 生成真实报告
