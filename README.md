# @deepwhale-cn/dsh-compliance-doc

[![dshfind 收录](https://dshfind.com/api/badge/feely0208/dsh-compliance-doc?lang=zh)](https://dshfind.com/zh/plugins/feely0208/dsh-compliance-doc)

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/zh/plugins/feely0208/dsh-compliance-doc)

**检查结果别只躺在终端里 —— 自查表、整改说明、带边界声明的合规证明，一次生成三份能直接交出去的文档。**

**关键词**：合规报告 · 自查表 · 整改说明 · 合规证明 · 等保三级 · 安全自查 · 整改复核 · 一键体检 · 交付文档 · 审计留痕

---

## 先说清楚它是什么、不是什么

**不装的代价**：扫描结果只在终端滚一遍屏，领导要「自查表」、客户要「整改说明」、
测评机构要「检查记录」，你还得手工从日志里一条条复制进 Excel —— 慢、容易漏、
格式还不统一；更麻烦的是，手写文档很容易顺手写一句「已合规」，把提示项说成结论。

**是**：把一份本地静态检查报告，整理成三份**可以直接交付**的文件：

| 文件 | 内容 | 谁看 |
|---|---|---|
| `自查表.csv` | 序号 / 检查项 / 严重度 / 依据 / 位置 / 状态 / 建议，UTF-8 BOM，Excel 双击就能开 | 执行整改的人 |
| `整改说明.md` | 背景、检查范围与方法、逐条问题 + 整改建议、复核方式 | 领导 / 客户 / 项目经理 |
| `合规证明.md` | 检查范围、规则条数、依据清单（去重）、结论措辞 | 对外提交 / 归档 |

**不是**：
- ❌ **不是合规认证** —— 静态检查证明不了合规，它只如实记录「规则库这一次查到了什么」
- ❌ **不是等保测评 / 监管检查 / 第三方审计的替代品** —— 那需要测评机构按标准现场核查
- ❌ **不产生新判据** —— 规则来自你已安装的深鲸守护插件，它只做整理和成文
- ❌ **不写「已合规」「保证通过」** —— 三份文件都带同一条声明，结论措辞按「提示项」而非「违规」表述

**一句话分界**：别的插件负责「查」，它负责把查出来的东西写成**能交出去、且有边界说明**的文档。

```
dsh-sbom / dsh-data-rights / ...  = 查
dsh-fix-verify                     = 复核改前改后
dsh-compliance-doc                 = 把上面两步的结果变成可交付文档
```

---

## 用法

```bash
# 从一个普通扫描报告生成三份文档
dsh-compliance-doc --input report.json --out ./交付文档

# 带单位名、检查日期、等保三级文档档次
dsh-compliance-doc --input report.json --out ./交付 \
  --org "某某科技有限公司" --date 2026-10-20 --profile 等保三级

# 配合 dsh-fix-verify：把改前改后复核结果整理成整改说明
dsh-fix-verify --before old --after new --json > fix-verify.json
dsh-compliance-doc --input fix-verify.json --out ./交付 --org "某某科技有限公司"
```

输出目录不存在会**自动创建**。

### 输入兼容两种 JSON

**① 普通 / suite 扫描报告**（`dsh-guard-core` 的标准输出）：

```json
{ "generatedAt": "...", "stats": { "scannedFiles": 34, "rulesRun": 12, ... }, "findings": [ ... ] }
```

**② `dsh-fix-verify` 的复核报告**：顶层有 `fixed` / `remaining` / `regressed` 数组。

字段不对、JSON 坏、输入缺失 → **exit 2**，不会硬编一份「看起来正常」的文档。

---

## 措辞红线（三份文件都写）

> 本文件由本地静态检查生成，不构成合规结论，不替代等保测评/监管检查/第三方审计。

- 不出现「已合规」「保证通过」「绝对合规」这类结论；
- 规则未命中时 `合规证明.md` 会写「本次检查覆盖 N 条规则、M 个文件，未发现提示项」，
  同时明确提醒「**未命中不等于没有问题**」；
- `--profile 等保三级` 只影响**文档组织方式**，不改变规则集，也不构成等保测评结论。

---

## 输出示例

```
  ✅ 自查表.csv        3 条检查项，Excel 可直接打开
  ✅ 整改说明.md       背景 / 范围与方法 / 逐条问题与建议 / 复核方式
  ✅ 合规证明.md       范围 / 规则条数 / 依据清单 / 结论措辞

  扫描    34 个文件 · 运行规则 12 条
  提示项  3 条（高 1 · 中 1 · 低 1）
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 三份文件正常生成 |
| `2` | 输入缺失 / JSON 解析失败 / 字段不对 / 参数错误 |

---

## 不要做什么

- 不要把它生成的 `合规证明.md` 当成「合规证书」对外使用 —— 它只是检查记录
- 不要删掉文件里的免责声明 —— 那句话是这份文档能用的前提
- 不要在输入报告为空时断定「项目没问题」—— 未命中不等于没有问题
- 不要把它当扫描器 —— 它不跑规则，只整理报告
- 不要用 `--profile 等保三级` 暗示已经做过等保测评 —— 那只影响文档排版

## 安装

```bash
dsh plugin --profile web add @deepwhale-cn/dsh-compliance-doc
```

## License

MIT © 深鲸 DeepWhale

## 深鲸网安守护系列（共 39 个）

> 一个插件做一件事。**安全问题是链式的** —— 配套用才完整。

**国内合规**（12）｜ [等保对照](https://github.com/feely0208/dsh-cn-mlps) · [日志留存](https://github.com/feely0208/dsh-cn-log-retention) · [备案公示](https://github.com/feely0208/dsh-cn-filing) · [用户同意](https://github.com/feely0208/dsh-consent-guard) · [个人信息权利](https://github.com/feely0208/dsh-data-rights) · [未成年人保护](https://github.com/feely0208/dsh-minor-guard) · [影响评估](https://github.com/feely0208/dsh-pipia) · [数据分类分级](https://github.com/feely0208/dsh-data-classify) · [算法备案](https://github.com/feely0208/dsh-algorithm-filing) · [数据出境](https://github.com/feely0208/dsh-cn-data-export) · [国密合规](https://github.com/feely0208/dsh-cn-crypto) · [AI 内容标识](https://github.com/feely0208/dsh-cn-ai-labeling)

**AI 与 Agent 治理**（6）｜ [AI 输出信任](https://github.com/feely0208/dsh-ai-output-trust) · [外部内容信任](https://github.com/feely0208/dsh-content-trust) · [MCP 安全](https://github.com/feely0208/dsh-mcp-audit) · [Agent 权限](https://github.com/feely0208/dsh-agent-scope) · [策略核对](https://github.com/feely0208/dsh-agent-policy) · [可疑指令](https://github.com/feely0208/dsh-phishing-guard)

**数据与凭据**（5）｜ [敏感数据](https://github.com/feely0208/dsh-data-scan) · [密钥轮换](https://github.com/feely0208/dsh-key-rotate) · [数据留存](https://github.com/feely0208/dsh-data-lifecycle) · [配置审计](https://github.com/feely0208/dsh-env-audit) · [密钥扫描](https://github.com/feely0208/dsh-secret-scan)

**供应链与构建**（5）｜ [开源许可](https://github.com/feely0208/dsh-license-guard) · [依赖投毒](https://github.com/feely0208/dsh-dep-audit) · [CI 安全](https://github.com/feely0208/dsh-ci-guard) · [工具审查](https://github.com/feely0208/dsh-tool-vet) · [物料清单](https://github.com/feely0208/dsh-sbom)

**权限与应急**（3）｜ [最小权限](https://github.com/feely0208/dsh-least-privilege) · [告警外发](https://github.com/feely0208/dsh-alert-relay) · [应急证据包](https://github.com/feely0208/dsh-incident-package)

**行业专项**（4）｜ [医疗行业专项](https://github.com/feely0208/dsh-industry-medical) · [教育行业专项](https://github.com/feely0208/dsh-industry-education) · [金融行业专项](https://github.com/feely0208/dsh-industry-finance) · [地方数据条例](https://github.com/feely0208/dsh-local-regulation)

**编排与交付**（4）｜ [一键体检](https://github.com/feely0208/dsh-guard-suite) · [改前改后复核](https://github.com/feely0208/dsh-fix-verify) · [合规可交付文档](https://github.com/feely0208/dsh-compliance-doc) · [整改建议](https://github.com/feely0208/dsh-remediation)

都在 DSH 插件市场（dsh-plugin.org）、npm 和 deepwhale.org.cn/guard.html 上。

---

<p align="right"><a href="https://deepwhale.org.cn"><img src="https://www.deepwhale.org.cn/images/badge/deepwhale-badge.png" alt="powered by dwh" height="20"></a></p>
