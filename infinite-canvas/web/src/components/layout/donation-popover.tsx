// [本地修改] 已移除「打赏加群」入口。
// 原组件（微信打赏二维码 + QQ 群号 1129692011）保留在 git 历史中，可用
//   git checkout -- infinite-canvas/web/src/components/layout/donation-popover.tsx
// 还原。
//
// 说明：保留同名导出与同样的 props 签名，避免调用方（顶部导航）类型报错；
// 实际渲染为 null，界面上不再出现任何打赏/加群提示。

import type { CSSProperties } from "react";

type DonationPopoverProps = {
    variant?: "default" | "canvas";
    className?: string;
    style?: CSSProperties;
};

export function DonationPopover(_props: DonationPopoverProps) {
    return null;
}
