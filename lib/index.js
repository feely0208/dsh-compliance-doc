import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';

// 把本地静态检查结果变成能交出去的文档：
// 自查表.csv / 整改说明.md / 合规证明.md，三份都带「不构成合规结论」声明。
export const { name, inject, apply } = createPlugin({
  name: 'compliance-doc',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/compliance-doc.md',
  binFile: 'bin/cli.mjs',
  description: '一份能交出去的自查表、整改说明和合规证明',
  whenToUse: '用户要把安全检查结果整理成可交付文档时使用：' +
    '「出一份自查表」「写个整改说明」「做一份合规证明」「检查报告要给领导/客户/测评机构看」。' +
    '输入可以是普通扫描报告，也可以是 dsh-fix-verify 的 --json 复核结果。',
});
