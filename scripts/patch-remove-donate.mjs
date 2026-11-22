// 去除「打赏加群」入口补丁
// 用法：node patch-remove-donate.mjs   （在 Local-Infinite-Canvas 根目录运行）
//
// 原理：前端 dist 是预构建的压缩包，打赏按钮是一个独立组件（本次构建中名为 IWt），
// 只在顶部导航被调用一次：`jsx(IWt,{variant:e})`。
// 本脚本自动定位「含“打赏加群”字样的组件函数名」，再把它在调用处替换为 null，
// 使按钮不渲染（组件代码保留但不可达），不破坏其余功能。
// 每次画布更新（v0.25.x 等）后重跑一次即可。

import fs from "node:fs";
import path from "node:path";

const assetsDir = path.resolve("infinite-canvas/web/dist/assets");
if (!fs.existsSync(assetsDir)) {
  console.error(`找不到目录：${assetsDir}（请在项目根目录运行）`);
  process.exit(1);
}

const targets = fs
  .readdirSync(assetsDir)
  .filter((f) => /^index-.*\.js$/.test(f))
  .map((f) => path.join(assetsDir, f));

const MARK = "打赏加群";
let didSomething = false;

for (const file of targets) {
  const src = fs.readFileSync(file, "utf8");
  const base = path.basename(file);

  if (!src.includes(MARK)) {
    console.log(`  ${base}: 无「打赏加群」字样，跳过`);
    continue;
  }

  // 1. 定位包含该字样的组件函数名（取该字样之前最近的一个 function 定义）
  const idx = src.indexOf(MARK);
  const defs = [...src.matchAll(/function ([A-Za-z_$][\w$]*)\s*\(/g)].filter((m) => m.index < idx);
  const name = defs.length ? defs[defs.length - 1][1] : null;
  if (!name) {
    console.log(`  ${base}: 未能定位组件函数名，跳过`);
    continue;
  }

  // 2. 把调用处 jsx(Name,{...}) 替换为 null
  const callRe = new RegExp(`jsx\\(${name},\\{[^}]*\\}\\)`, "g");
  const hits = src.match(callRe) || [];
  if (!hits.length) {
    console.log(`  ${base}: 组件 ${name} 未找到调用点，可能已被处理，跳过`);
    continue;
  }

  const patched = src.replace(callRe, "null");

  // 3. 备份原文件（只备份一次）
  const backup = `${file}.donate-orig`;
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);

  // 4. 校验：只应减少命中片段，括号配平不变
  if (patched.length >= src.length) {
    console.log(`  ${base}: 替换后长度异常，放弃写入`);
    continue;
  }

  fs.writeFileSync(file, patched, "utf8");
  console.log(`  ${base}: ✅ 已屏蔽组件 ${name}（${hits.length} 处调用 → null）`);
  console.log(`        原文件备份：${path.basename(backup)}`);
  didSomething = true;
}

if (!didSomething) {
  console.log("\n没有需要修改的文件（可能已打过补丁）。");
  console.log("如需还原：把 *.donate-orig 覆盖回同名的 .js 文件。");
} else {
  console.log("\n完成。刷新浏览器（Ctrl+F5 强制清缓存）后生效。");
}
