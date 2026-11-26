/**
 * 手绘画板节点（sketch:pad）  v1.2.0
 *
 * 用途：手绘/描摹线稿 → 直接当「参考图片」参与生成（连到生成配置或图片卡即可），
 *       或点「导出为图片卡」变成普通图片节点，继续走裁剪/局部重绘/超分等链路。
 *
 * 交互：双击画板卡片（或悬浮工具条「打开画板」）→ 全屏画板 → 完成保存。
 *       把一张图片连到画板节点上，画板会把它作为半透明底图供描摹（可开关）。
 *
 * v1.2.0 新增（B1/B2/B4）
 *   B1 图形工具：直线 L / 矩形 U / 椭圆 O / 箭头 A（Shift 约束 45° 与正方形）
 *   B2 文字标注：文字 T，点击位置输入多行文字（当前色，字号随粗细）
 *   B4 改画布尺寸时按比例缩放已有笔画/图形/文字，不再清空
 *
 * v1.1.0 新增（A1–A4）
 *   A1 缩放/平移：滚轮以光标为锚点缩放（0.2×–8×）、空格+拖拽 / 中键拖拽平移、
 *      工具条「− / 100% / + / 适合」；底图与笔画一起变换，描细节不再靠瞎猜。
 *   A2 三种导出：白底线稿 / 线稿+底图合成 / 透明线稿（PNG alpha），
 *      白底线稿适合 ControlNet 类线稿约束，合成图适合「保形改图」。
 *   A3 彩色标注：6 色色板（1–6 快捷键），线条可上色（红腰带/肤色/标注）。
 *   A4 选区填充/擦除：套索选区 → 用当前色填充，或擦成透明（做手绘蒙版）。
 *
 * 压感修正：
 *   手写笔 → 真实 pressure + 低通滤波（仿 atrament），supprimulatePressure 关闭；
 *   鼠标   → 开启 simulatePressure（按速度模拟压感），线条不再是铁丝。
 *
 * 笔触：内联 vendor 了 perfect-freehand 1.2.3（MIT License, Copyright (c) 2021 Stephen Ruiz Ltd），
 *       离线可用，不需要联网或额外依赖。
 */
export default function (runtime) {
    const { React } = runtime;
    const h = React.createElement;

    const NODE_TYPE = "sketch:pad";
    const STORE_PREFIX = "sketch:";
    const SIZES = [
        { label: "1024 × 1024（1:1）", width: 1024, height: 1024 },
        { label: "1024 × 576（16:9）", width: 1024, height: 576 },
        { label: "576 × 1024（9:16）", width: 576, height: 1024 },
        { label: "768 × 768（快，省显存）", width: 768, height: 768 },
        { label: "1536 × 1024（3:2，分镜）", width: 1536, height: 1024 },
    ];
    const BRUSH_MIN = 1;
    const BRUSH_MAX = 64;
    const GUIDE_ALPHA = 0.28;
    const GUIDE_ALPHA_EXPORT = 0.55;
    const ZOOM_MIN = 0.2;
    const ZOOM_MAX = 8;
    const PRESSURE_ALPHA = 0.35; // 压感低通系数（越小越稳、越钝）

    const PALETTE = [
        { id: "ink", color: "#111111", label: "墨" },
        { id: "red", color: "#d93a2b", label: "红" },
        { id: "blue", color: "#2f6df6", label: "蓝" },
        { id: "green", color: "#18985a", label: "绿" },
        { id: "skin", color: "#d9a06b", label: "肤" },
        { id: "gray", color: "#8a8f98", label: "灰" },
    ];

    const EXPORT_MODES = [
        { id: "white", label: "白底线稿" },
        { id: "composite", label: "线稿 + 底图" },
        { id: "alpha", label: "透明线稿" },
    ];

    // ---------------------------------------------------------------- 笔触引擎
        const PerfectFreehand = (function () {
        const exports = {};
        Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:`Module`}});const{PI:e}=Math,t=e+1e-4,n=.5,r=[1,1];function i(e,t,n,r=e=>e){return e*r(.5-t*(.5-n))}const{min:a}=Math;function o(e,t,n){let r=a(1,t/n);return a(1,e+(a(1,1-r)-e)*(r*.275))}function s(e){return[-e[0],-e[1]]}function c(e,t){return[e[0]+t[0],e[1]+t[1]]}function l(e,t,n){return e[0]=t[0]+n[0],e[1]=t[1]+n[1],e}function u(e,t){return[e[0]-t[0],e[1]-t[1]]}function d(e,t,n){return e[0]=t[0]-n[0],e[1]=t[1]-n[1],e}function f(e,t){return[e[0]*t,e[1]*t]}function p(e,t,n){return e[0]=t[0]*n,e[1]=t[1]*n,e}function m(e,t){return[e[0]/t,e[1]/t]}function h(e){return[e[1],-e[0]]}function g(e,t){let n=t[0];return e[0]=t[1],e[1]=-n,e}function ee(e,t){return e[0]*t[0]+e[1]*t[1]}function _(e,t){return e[0]===t[0]&&e[1]===t[1]}function v(e){return Math.hypot(e[0],e[1])}function y(e,t){let n=e[0]-t[0],r=e[1]-t[1];return n*n+r*r}function b(e){return m(e,v(e))}function x(e,t){return Math.hypot(e[1]-t[1],e[0]-t[0])}function S(e,t,n){let r=Math.sin(n),i=Math.cos(n),a=e[0]-t[0],o=e[1]-t[1],s=a*i-o*r,c=a*r+o*i;return[s+t[0],c+t[1]]}function C(e,t,n,r){let i=Math.sin(r),a=Math.cos(r),o=t[0]-n[0],s=t[1]-n[1],c=o*a-s*i,l=o*i+s*a;return e[0]=c+n[0],e[1]=l+n[1],e}function w(e,t,n){return c(e,f(u(t,e),n))}function te(e,t,n,r){let i=n[0]-t[0],a=n[1]-t[1];return e[0]=t[0]+i*r,e[1]=t[1]+a*r,e}function T(e,t,n){return c(e,f(t,n))}const E=[0,0],D=[0,0],O=[0,0];function k(e,n){let r=T(e,b(h(u(e,c(e,[1,1])))),-n),i=[],a=1/13;for(let n=a;n<=1;n+=a)i.push(S(r,e,t*2*n));return i}function A(e,n,r){let i=[],a=1/r;for(let r=a;r<=1;r+=a)i.push(S(n,e,t*r));return i}function j(e,t,n){let r=u(t,n),i=f(r,.5),a=f(r,.51);return[u(e,i),u(e,a),c(e,a),c(e,i)]}function M(e,n,r,i){let a=[],o=T(e,n,r),s=1/i;for(let n=s;n<1;n+=s)a.push(S(o,e,t*3*n));return a}function ne(e,t,n){return[c(e,f(t,n)),c(e,f(t,n*.99)),u(e,f(t,n*.99)),u(e,f(t,n))]}function N(e,t,n){return e===!1||e===void 0?0:e===!0?Math.max(t,n):e}function re(e,t,n){return e.slice(0,10).reduce((e,r)=>{let i=r.pressure;return t&&(i=o(e,r.distance,n)),(e+i)/2},e[0].pressure)}function P(e,n={}){let{size:r=16,smoothing:a=.5,thinning:f=.5,simulatePressure:m=!0,easing:_=e=>e,start:v={},end:b={},last:x=!1}=n,{cap:S=!0,easing:w=e=>e*(2-e)}=v,{cap:T=!0,easing:P=e=>--e*e*e+1}=b;if(e.length===0||r<=0)return[];let F=e[e.length-1].runningLength,I=N(v.taper,r,F),L=N(b.taper,r,F),R=(r*a)**2,z=[],B=[],V=re(e,m,r),H=i(r,f,e[e.length-1].pressure,_),U,W=e[0].vector,G=e[0].point,K=G,q=G,J=K,Y=!1;for(let n=0;n<e.length;n++){let{pressure:a}=e[n],{point:s,vector:h,distance:v,runningLength:b}=e[n],x=n===e.length-1;if(!x&&F-b<3)continue;f?(m&&(a=o(V,v,r)),H=i(r,f,a,_)):H=r/2,U===void 0&&(U=H);let S=b<I?w(b/I):1,T=F-b<L?P((F-b)/L):1;H=Math.max(.01,H*Math.min(S,T));let k=(x?e[n]:e[n+1]).vector,A=x?1:ee(h,k),j=ee(h,W)<0&&!Y,M=A!==null&&A<0;if(j||M){g(E,W),p(E,E,H);for(let e=0;e<=1;e+=.07692307692307693)d(D,s,E),C(D,D,s,t*e),q=[D[0],D[1]],z.push(q),l(O,s,E),C(O,O,s,t*-e),J=[O[0],O[1]],B.push(J);G=q,K=J,M&&(Y=!0);continue}if(Y=!1,x){g(E,h),p(E,E,H),z.push(u(s,E)),B.push(c(s,E));continue}te(E,k,h,A),g(E,E),p(E,E,H),d(D,s,E),q=[D[0],D[1]],(n<=1||y(G,q)>R)&&(z.push(q),G=q),l(O,s,E),J=[O[0],O[1]],(n<=1||y(K,J)>R)&&(B.push(J),K=J),V=a,W=h}let X=[e[0].point[0],e[0].point[1]],Z=e.length>1?[e[e.length-1].point[0],e[e.length-1].point[1]]:c(e[0].point,[1,1]),Q=[],$=[];if(e.length===1){if(!(I||L)||x)return k(X,U||H)}else{I||L&&e.length===1||(S?Q.push(...A(X,B[0],13)):Q.push(...j(X,z[0],B[0])));let t=h(s(e[e.length-1].vector));L||I&&e.length===1?$.push(Z):T?$.push(...M(Z,t,H,29)):$.push(...ne(Z,t,H))}return z.concat($,B.reverse(),Q)}const F=[0,0];function I(e){return e!=null&&e>=0}function L(e,t={}){let{streamline:i=.5,size:a=16,last:o=!1}=t;if(e.length===0)return[];let s=.15+(1-i)*.85,l=Array.isArray(e[0])?e:e.map(({x:e,y:t,pressure:r=n})=>[e,t,r]);if(l.length===2){let e=l[1];l=l.slice(0,-1);for(let t=1;t<5;t++)l.push(w(l[0],e,t/4))}l.length===1&&(l=[...l,[...c(l[0],r),...l[0].slice(2)]]);let u=[{point:[l[0][0],l[0][1]],pressure:I(l[0][2])?l[0][2]:.25,vector:[...r],distance:0,runningLength:0}],f=!1,p=0,m=u[0],h=l.length-1;for(let e=1;e<l.length;e++){let t=o&&e===h?[l[e][0],l[e][1]]:w(m.point,l[e],s);if(_(m.point,t))continue;let r=x(t,m.point);if(p+=r,e<h&&!f){if(p<a)continue;f=!0}d(F,m.point,t),m={point:t,pressure:I(l[e][2])?l[e][2]:n,vector:b(F),distance:r,runningLength:p},u.push(m)}return u[0].vector=u[1]?.vector||[0,0],u}function R(e,t={}){return P(L(e,t),t)}var z=R;exports.default=z,exports.getStroke=R,exports.getStrokeOutlinePoints=P,exports.getStrokePoints=L;
        return exports;
    })();
    const getStroke = (typeof PerfectFreehand !== "undefined" && PerfectFreehand.getStroke) || null;

    function strokeOptions(size, stylus) {
        return {
            size,
            thinning: stylus ? 0.62 : 0.45,
            smoothing: stylus ? 0.6 : 0.5,
            streamline: stylus ? 0.42 : 0.3,
            simulatePressure: !stylus,
            easing: (t) => t,
            start: { taper: 0, cap: true },
            end: { taper: size * (stylus ? 0.3 : 0.4), cap: true },
        };
    }

    function outlineFor(stroke) {
        if (!getStroke) return null;
        const points = stroke.points.map((point) => [point[0], point[1], point[2]]);
        return getStroke(points, strokeOptions(stroke.size, Boolean(stroke.stylus)));
    }

    function strokeColor(stroke) {
        return typeof stroke.color === "string" && stroke.color ? stroke.color : "#111111";
    }

    function tracePoints(context, points) {
        points.forEach((point, index) => {
            if (index === 0) context.moveTo(point[0], point[1]);
            else context.lineTo(point[0], point[1]);
        });
    }

    /** 把一条笔触/一次填充画到指定图层（统一入口，回放与实时预览共用） */
    function drawOp(context, op) {
        if (!op) return;

        // ---- 图形：直线 / 箭头 / 矩形 / 椭圆（B1）
        if (op.mode === "shape") {
            const points = Array.isArray(op.points) ? op.points : [];
            const from = points[0];
            const to = points[1];
            if (!from || !to) return;
            context.save();
            context.strokeStyle = strokeColor(op);
            context.fillStyle = strokeColor(op);
            context.lineWidth = Math.max(1, op.size);
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            if (op.shape === "rect") {
                context.rect(
                    Math.min(from[0], to[0]),
                    Math.min(from[1], to[1]),
                    Math.abs(to[0] - from[0]),
                    Math.abs(to[1] - from[1]),
                );
            } else if (op.shape === "ellipse") {
                context.ellipse(
                    (from[0] + to[0]) / 2,
                    (from[1] + to[1]) / 2,
                    Math.abs(to[0] - from[0]) / 2,
                    Math.abs(to[1] - from[1]) / 2,
                    0,
                    0,
                    Math.PI * 2,
                );
            } else {
                context.moveTo(from[0], from[1]);
                context.lineTo(to[0], to[1]);
            }
            context.stroke();
            if (op.shape === "arrow") {
                const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
                const head = Math.max(10, op.size * 4);
                [Math.PI / 7, -Math.PI / 7].forEach((delta) => {
                    context.beginPath();
                    context.moveTo(to[0], to[1]);
                    context.lineTo(to[0] - head * Math.cos(angle + delta), to[1] - head * Math.sin(angle + delta));
                    context.stroke();
                });
            }
            context.restore();
            return;
        }

        // ---- 文字标注（B2）
        if (op.mode === "text") {
            const at = (op.points || [])[0];
            const text = typeof op.text === "string" ? op.text : "";
            if (!at || !text) return;
            const size = Math.max(12, Number(op.size) || 24);
            context.save();
            context.fillStyle = strokeColor(op);
            context.font = '600 ' + size + 'px "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", system-ui, sans-serif';
            context.textBaseline = "top";
            text.split("\n").forEach((line, index) => {
                context.fillText(line, at[0], at[1] + index * size * 1.28);
            });
            context.restore();
            return;
        }

        // ---- 选区：填充 / 擦除（A4）
        if (op.mode === "fill" || op.mode === "cut") {
            if (!Array.isArray(op.path) || op.path.length < 3) return;
            context.save();
            if (op.mode === "cut") context.globalCompositeOperation = "destination-out";
            context.fillStyle = op.mode === "cut" ? "#000000" : strokeColor(op);
            context.beginPath();
            tracePoints(context, op.path);
            context.closePath();
            context.fill();
            context.restore();
            return;
        }

        // ---- 笔触：笔刷 / 橡皮
        const isEraser = op.mode === "eraser";
        context.save();
        context.globalCompositeOperation = isEraser ? "destination-out" : "source-over";

        const outline = outlineFor(op);
        if (!outline || outline.length < 2) {
            // 没有笔触引擎时退化为等宽线条，避免画不出来。
            context.strokeStyle = isEraser ? "#000000" : strokeColor(op);
            context.lineWidth = op.size;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            tracePoints(context, op.points);
            context.stroke();
            context.restore();
            return;
        }

        context.fillStyle = isEraser ? "#000000" : strokeColor(op);
        context.beginPath();
        const first = outline[0];
        if (first && Array.isArray(first) && Array.isArray(first[0])) {
            // 带平滑的多轮廓：逐个描边路径
            outline.forEach((polygon) => {
                if (!Array.isArray(polygon) || polygon.length < 2) return;
                context.moveTo(polygon[0][0], polygon[0][1]);
                for (let i = 1; i < polygon.length; i += 1) context.lineTo(polygon[i][0], polygon[i][1]);
                context.closePath();
            });
        } else {
            context.moveTo(first[0], first[1]);
            for (let i = 1; i < outline.length; i += 1) context.lineTo(outline[i][0], outline[i][1]);
            context.closePath();
        }
        context.fill();
        context.restore();
    }

    // ---------------------------------------------------------------- 全屏画板
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    function openSketchEditor({ width, height, strokes, guideUrl, exportMode, onCancel, onDone }) {
        const state = {
            width: width || SIZES[0].width,
            height: height || SIZES[0].height,
            strokes: Array.isArray(strokes) ? strokes.slice() : [],
            redo: [],
            tool: "brush",
            brush: 10,
            color: PALETTE[0].color,
            selectMode: "fill", // fill = 用当前色填充；cut = 擦成透明
            exportMode: EXPORT_MODES.some((mode) => mode.id === exportMode) ? exportMode : "white",
            guide: Boolean(guideUrl),
        };
        const camera = { zoom: 1, x: 0, y: 0, baseScale: 1 };
        let live = null; // 正在画的笔触
        let marquee = null; // 正在圈的选区（套索）
        let panning = null; // 平移拖拽
        let spaceDown = false;
        let guideImage = null;
        let smoothedPressure = 0.5;

        const root = el("div", "sk-root");
        const panel = el("div", "sk-panel");
        const bar = el("div", "sk-bar");
        const bar2 = el("div", "sk-bar");
        const viewport = el("div", "sk-viewport");
        const stage = el("div", "sk-stage");
        const hint = el("div", "sk-hint");

        const display = document.createElement("canvas");
        const committed = document.createElement("canvas");
        const liveCanvas = document.createElement("canvas");
        [display, committed, liveCanvas].forEach((canvas) => {
            canvas.width = state.width;
            canvas.height = state.height;
            canvas.style.display = "block";
        });
        // 上层图层只负责显示，必须让指针事件穿透到最底下的 display 画布，否则画不出东西。
        [committed, liveCanvas].forEach((canvas) => {
            canvas.style.position = "absolute";
            canvas.style.inset = "0";
            canvas.style.pointerEvents = "none";
        });
        stage.appendChild(display);
        stage.appendChild(committed);
        stage.appendChild(liveCanvas);
        viewport.appendChild(stage);
        stage.style.transformOrigin = "0 0";

        // ---- 工具：笔刷 / 橡皮 / 选区
        const toolGroup = el("div", "sk-group");
        const brushButton = el("button", "sk-btn", "笔刷 B");
        const eraserButton = el("button", "sk-btn", "橡皮 E");
        const selectButton = el("button", "sk-btn", "选区 R");
        [brushButton, eraserButton, selectButton].forEach((button) => {
            button.type = "button";
        });
        toolGroup.append(brushButton, eraserButton, selectButton);

        // ---- 图形与文字（B1 / B2）
        const shapeGroup = el("div", "sk-group");
        const lineButton = el("button", "sk-btn", "直线 L");
        const rectButton = el("button", "sk-btn", "矩形 U");
        const ellipseButton = el("button", "sk-btn", "椭圆 O");
        const arrowButton = el("button", "sk-btn", "箭头 A");
        const textButton = el("button", "sk-btn", "文字 T");
        [lineButton, rectButton, ellipseButton, arrowButton, textButton].forEach((button) => {
            button.type = "button";
        });
        shapeGroup.append(lineButton, rectButton, ellipseButton, arrowButton, textButton);

        // ---- 选区子模式（A4）
        const selectGroup = el("div", "sk-group");
        const fillButton = el("button", "sk-btn sk-mini", "填充");
        const cutButton = el("button", "sk-btn sk-mini", "擦空");
        [fillButton, cutButton].forEach((button) => {
            button.type = "button";
        });
        selectGroup.append(fillButton, cutButton);

        // ---- 粗细
        const sizeWrap = el("label", "sk-field");
        const sizeLabel = el("span", "sk-field-label", "粗细 10");
        const sizeInput = document.createElement("input");
        sizeInput.type = "range";
        sizeInput.min = String(BRUSH_MIN);
        sizeInput.max = String(BRUSH_MAX);
        sizeInput.step = "1";
        sizeInput.value = String(state.brush);
        sizeInput.className = "sk-range";
        sizeWrap.append(sizeLabel, sizeInput);

        // ---- 色板（A3）
        const colorGroup = el("div", "sk-group sk-colors");
        const swatches = PALETTE.map((entry) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "sk-swatch";
            button.title = `${entry.label}（${entry.id}）`;
            button.style.background = entry.color;
            button.dataset.color = entry.color;
            button.addEventListener("click", () => {
                state.color = entry.color;
                if (state.tool === "eraser") paintMode("brush");
                syncUI();
            });
            colorGroup.appendChild(button);
            return button;
        });

        // ---- 历史
        const historyGroup = el("div", "sk-group");
        const undoButton = el("button", "sk-btn", "撤销");
        const redoButton = el("button", "sk-btn", "重做");
        const clearButton = el("button", "sk-btn", "清空");
        [undoButton, redoButton, clearButton].forEach((button) => {
            button.type = "button";
        });
        historyGroup.append(undoButton, redoButton, clearButton);

        // ---- 缩放（A1）
        const zoomGroup = el("div", "sk-group");
        const zoomOutButton = el("button", "sk-btn sk-mini", "−");
        const zoomLabel = el("button", "sk-btn sk-mini", "100%");
        const zoomInButton = el("button", "sk-btn sk-mini", "+");
        const zoomFitButton = el("button", "sk-btn sk-mini", "适合");
        [zoomOutButton, zoomLabel, zoomInButton, zoomFitButton].forEach((button) => {
            button.type = "button";
        });
        zoomGroup.append(zoomOutButton, zoomLabel, zoomInButton, zoomFitButton);

        // ---- 尺寸 / 导出模式 / 底图开关
        const sizeSelect = document.createElement("select");
        sizeSelect.className = "sk-select";
        SIZES.forEach((size) => {
            const option = document.createElement("option");
            option.value = `${size.width}x${size.height}`;
            option.textContent = size.label;
            sizeSelect.appendChild(option);
        });
        sizeSelect.value = `${state.width}x${state.height}`;

        const exportSelect = document.createElement("select");
        exportSelect.className = "sk-select";
        EXPORT_MODES.forEach((mode) => {
            const option = document.createElement("option");
            option.value = mode.id;
            option.textContent = `导出：${mode.label}`;
            exportSelect.appendChild(option);
        });
        exportSelect.value = state.exportMode;

        const guideWrap = el("label", "sk-check");
        const guideInput = document.createElement("input");
        guideInput.type = "checkbox";
        guideInput.checked = state.guide;
        guideInput.disabled = !guideUrl;
        guideWrap.append(guideInput, el("span", "", guideUrl ? "显示底图" : "无底图（连一张图即可描摹）"));

        const spacer = el("div", "sk-spacer");
        const cancelButton = el("button", "sk-btn sk-ghost", "取消");
        const doneButton = el("button", "sk-btn sk-primary", "完成");
        cancelButton.type = "button";
        doneButton.type = "button";

        bar.append(toolGroup, shapeGroup, selectGroup, sizeWrap, colorGroup);
        bar2.append(historyGroup, zoomGroup, sizeSelect, exportSelect, guideWrap, spacer, cancelButton, doneButton);
        panel.append(bar, bar2, viewport, hint);
        root.appendChild(panel);
        document.body.appendChild(root);

        hint.textContent =
            "滚轮缩放 · 空格/中键平移 · B 笔刷 · E 橡皮 · R 选区 · L 直线 · U 矩形 · O 椭圆 · A 箭头 · T 文字 · Shift 约束 · 1–6 换色 · Ctrl+Z 撤销 · Enter 完成";

        // ---- 画布
        const displayContext = display.getContext("2d");
        const committedContext = committed.getContext("2d", { willReadFrequently: false });
        const liveContext = liveCanvas.getContext("2d");

        function applyCamera() {
            stage.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
        }

        function fit() {
            const maxWidth = window.innerWidth - 80;
            const maxHeight = window.innerHeight - 240;
            camera.baseScale = Math.max(0.1, Math.min(maxWidth / state.width, maxHeight / state.height, 1));
            stage.style.width = `${Math.round(state.width * camera.baseScale)}px`;
            stage.style.height = `${Math.round(state.height * camera.baseScale)}px`;
            [display, committed, liveCanvas].forEach((canvas) => {
                canvas.style.width = "100%";
                canvas.style.height = "100%";
            });
            resetCamera();
        }

        function resetCamera() {
            camera.zoom = 1;
            camera.x = 0;
            camera.y = 0;
            applyCamera();
            syncUI();
        }

        function zoomAt(factor, clientX, clientY) {
            const rect = viewport.getBoundingClientRect();
            const anchorX = (clientX === undefined ? rect.width / 2 : clientX - rect.left);
            const anchorY = (clientY === undefined ? rect.height / 2 : clientY - rect.top);
            const previous = camera.zoom;
            const next = clamp(previous * factor, ZOOM_MIN, ZOOM_MAX);
            if (next === previous) return;
            camera.x = anchorX - ((anchorX - camera.x) / previous) * next;
            camera.y = anchorY - ((anchorY - camera.y) / previous) * next;
            camera.zoom = next;
            applyCamera();
            syncUI();
        }

        function composite() {
            displayContext.save();
            displayContext.clearRect(0, 0, state.width, state.height);
            displayContext.fillStyle = "#ffffff";
            displayContext.fillRect(0, 0, state.width, state.height);
            if (state.guide && guideImage) {
                displayContext.globalAlpha = GUIDE_ALPHA;
                displayContext.drawImage(guideImage, 0, 0, state.width, state.height);
                displayContext.globalAlpha = 1;
            }
            displayContext.drawImage(committed, 0, 0);
            displayContext.drawImage(liveCanvas, 0, 0);
            displayContext.restore();
        }

        function replayCommitted() {
            committedContext.clearRect(0, 0, state.width, state.height);
            state.strokes.forEach((op) => drawOp(committedContext, op));
            composite();
        }

        function drawLive() {
            liveContext.clearRect(0, 0, state.width, state.height);
            if (live) {
                // 橡皮在透明图层上 destination-out 看不见效果，用半透明灰做预览
                if (live.mode === "eraser") {
                    drawOp(liveContext, { ...live, mode: "brush", color: "rgba(150,160,175,0.55)" });
                } else {
                    drawOp(liveContext, live);
                }
            }
            if (marquee && marquee.points.length > 1) {
                // 选区预览：虚线 + 半透明填充
                liveContext.save();
                const fill = state.selectMode === "cut" ? "rgba(255,255,255,0.35)" : "rgba(47,109,246,0.18)";
                liveContext.fillStyle = fill;
                liveContext.beginPath();
                tracePoints(liveContext, marquee.points);
                liveContext.closePath();
                liveContext.fill();
                liveContext.setLineDash([6 / camera.zoom, 5 / camera.zoom]);
                liveContext.lineWidth = 1.4 / camera.zoom;
                liveContext.strokeStyle = state.selectMode === "cut" ? "#d93a2b" : "#2f6df6";
                liveContext.stroke();
                liveContext.restore();
            }
            composite();
        }

        function syncUI() {
            brushButton.dataset.active = String(state.tool === "brush");
            eraserButton.dataset.active = String(state.tool === "eraser");
            selectButton.dataset.active = String(state.tool === "select");
            lineButton.dataset.active = String(state.tool === "line");
            rectButton.dataset.active = String(state.tool === "rect");
            ellipseButton.dataset.active = String(state.tool === "ellipse");
            arrowButton.dataset.active = String(state.tool === "arrow");
            textButton.dataset.active = String(state.tool === "text");
            fillButton.dataset.active = String(state.selectMode === "fill");
            cutButton.dataset.active = String(state.selectMode === "cut");
            fillButton.disabled = state.tool !== "select";
            cutButton.disabled = state.tool !== "select";
            swatches.forEach((button) => {
                button.dataset.active = String(button.dataset.color === state.color);
            });
            sizeLabel.textContent = `粗细 ${state.brush}`;
            undoButton.disabled = state.strokes.length === 0;
            redoButton.disabled = state.redo.length === 0;
            clearButton.disabled = state.strokes.length === 0;
            guideInput.checked = state.guide;
            zoomLabel.textContent = `${Math.round(camera.zoom * 100)}%`;
            zoomOutButton.disabled = camera.zoom <= ZOOM_MIN + 0.001;
            zoomInButton.disabled = camera.zoom >= ZOOM_MAX - 0.001;
            stage.style.cursor = panning
                ? "grabbing"
                : spaceDown
                  ? "grab"
                  : state.tool === "select"
                    ? "cell"
                    : state.tool === "text"
                      ? "text"
                      : "crosshair";
        }

        // ---- 指针绘制
        function pointFrom(event) {
            const rect = display.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * state.width;
            const y = ((event.clientY - rect.top) / rect.height) * state.height;
            const stylus = event.pointerType === "pen";
            let pressure = stylus ? clamp(Number(event.pressure) || 0.5, 0.05, 1) : 0.5;
            if (stylus) {
                // 仿 atrament：压力值低通，避免笔尖抖动导致粗细跳变
                smoothedPressure = smoothedPressure * (1 - PRESSURE_ALPHA) + pressure * PRESSURE_ALPHA;
                pressure = smoothedPressure;
            }
            return [clamp(x, 0, state.width), clamp(y, 0, state.height), pressure, stylus];
        }

        function onPointerDown(event) {
            if (panning) return;
            const isMiddle = event.button === 1;
            if (isMiddle || (spaceDown && event.pointerType === "mouse")) {
                event.preventDefault();
                panning = { x: event.clientX, y: event.clientY };
                display.setPointerCapture?.(event.pointerId);
                syncUI();
                return;
            }
            if (event.button !== 0 && event.pointerType === "mouse") return;
            event.preventDefault();
            display.setPointerCapture?.(event.pointerId);

            if (state.tool === "select") {
                const point = pointFrom(event);
                marquee = { points: [[point[0], point[1]]] };
                drawLive();
                return;
            }

            const point = pointFrom(event);

            if (state.tool === "text") {
                const text = window.prompt("输入文字（\\n 换行）：", "");
                if (text && text.trim()) {
                    state.strokes.push({
                        mode: "text",
                        text: text.replace(/\\n/g, "\n"),
                        size: Math.max(12, state.brush * 3),
                        color: state.color,
                        points: [[point[0], point[1]]],
                    });
                    state.redo = [];
                    replayCommitted();
                    syncUI();
                }
                return;
            }

            if (state.tool === "line" || state.tool === "rect" || state.tool === "ellipse" || state.tool === "arrow") {
                live = {
                    mode: "shape",
                    shape: state.tool,
                    size: state.brush,
                    color: state.color,
                    points: [
                        [point[0], point[1]],
                        [point[0], point[1]],
                    ],
                    shift: Boolean(event.shiftKey),
                };
                drawLive();
                return;
            }

            smoothedPressure = point[2];
            live = {
                mode: state.tool === "eraser" ? "eraser" : "brush",
                size: state.brush,
                color: state.color,
                stylus: point[3],
                points: [point],
            };
            drawLive();
        }

        function onPointerMove(event) {
            if (panning) {
                camera.x += event.clientX - panning.x;
                camera.y += event.clientY - panning.y;
                panning = { x: event.clientX, y: event.clientY };
                applyCamera();
                return;
            }
            if (marquee) {
                const point = pointFrom(event);
                const last = marquee.points[marquee.points.length - 1];
                if (Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) < 2 / camera.zoom) return;
                marquee.points.push([point[0], point[1]]);
                drawLive();
                return;
            }
            if (!live) return;
            const point = pointFrom(event);

            if (live.mode === "shape") {
                const from = live.points[0];
                let toX = point[0];
                let toY = point[1];
                if (event.shiftKey) {
                    if (live.shape === "line" || live.shape === "arrow") {
                        // 约束到 45° 的整数倍
                        const angle = Math.atan2(toY - from[1], toX - from[0]);
                        const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
                        const length = Math.hypot(toX - from[0], toY - from[1]);
                        toX = from[0] + length * Math.cos(snapped);
                        toY = from[1] + length * Math.sin(snapped);
                    } else {
                        // 矩形/椭圆约束成正方形/正圆
                        const side = Math.max(Math.abs(toX - from[0]), Math.abs(toY - from[1]));
                        toX = from[0] + Math.sign(toX - from[0] || 1) * side;
                        toY = from[1] + Math.sign(toY - from[1] || 1) * side;
                    }
                }
                live.points[1] = [toX, toY];
                drawLive();
                return;
            }

            const last = live.points[live.points.length - 1];
            if (Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) < 1.2 / camera.zoom) return;
            live.points.push(point);
            drawLive();
        }

        function onPointerUp(event) {
            if (panning) {
                panning = null;
                syncUI();
                return;
            }
            if (marquee) {
                const points = marquee.points;
                marquee = null;
                if (points.length >= 3) {
                    const area = Math.abs(
                        points.reduce((acc, point, index) => {
                            const next = points[(index + 1) % points.length];
                            return acc + (point[0] * next[1] - next[0] * point[1]);
                        }, 0) / 2,
                    );
                    if (area > 4) {
                        state.strokes.push({
                            mode: state.selectMode === "cut" ? "cut" : "fill",
                            color: state.color,
                            path: points,
                        });
                        state.redo = [];
                    }
                }
                liveContext.clearRect(0, 0, state.width, state.height);
                replayCommitted();
                syncUI();
                return;
            }
            if (!live) return;

            if (live.mode === "shape") {
                const from = live.points[0];
                const to = live.points[1];
                const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
                if (distance >= 2) {
                    state.strokes.push({
                        mode: "shape",
                        shape: live.shape,
                        size: live.size,
                        color: live.color,
                        points: [from, to],
                    });
                    state.redo = [];
                }
                live = null;
                liveContext.clearRect(0, 0, state.width, state.height);
                replayCommitted();
                syncUI();
                return;
            }

            if (live.points.length === 1) {
                const only = live.points[0];
                live.points.push([only[0] + 0.6, only[1] + 0.6, only[2], only[3]]);
            }
            state.strokes.push(live);
            state.redo = [];
            live = null;
            liveContext.clearRect(0, 0, state.width, state.height);
            replayCommitted();
            syncUI();
        }

        display.addEventListener("pointerdown", onPointerDown);
        display.addEventListener("pointermove", onPointerMove);
        display.addEventListener("pointerup", onPointerUp);
        display.addEventListener("pointercancel", onPointerUp);

        // ---- 滚轮缩放（A1）
        viewport.addEventListener(
            "wheel",
            (event) => {
                if (!event.ctrlKey && !event.metaKey && Math.abs(event.deltaY) < 1) return;
                event.preventDefault();
                const factor = Math.pow(1.0016, -event.deltaY);
                zoomAt(factor, event.clientX, event.clientY);
            },
            { passive: false },
        );

        // ---- 按钮
        function paintMode(mode) {
            state.tool = mode;
            if (mode !== "select") marquee = null;
            drawLive();
            syncUI();
        }

        brushButton.addEventListener("click", () => paintMode("brush"));
        eraserButton.addEventListener("click", () => paintMode("eraser"));
        selectButton.addEventListener("click", () => paintMode("select"));
        lineButton.addEventListener("click", () => paintMode("line"));
        rectButton.addEventListener("click", () => paintMode("rect"));
        ellipseButton.addEventListener("click", () => paintMode("ellipse"));
        arrowButton.addEventListener("click", () => paintMode("arrow"));
        textButton.addEventListener("click", () => paintMode("text"));
        fillButton.addEventListener("click", () => {
            state.selectMode = "fill";
            paintMode("select");
        });
        cutButton.addEventListener("click", () => {
            state.selectMode = "cut";
            paintMode("select");
        });
        sizeInput.addEventListener("input", () => {
            state.brush = Number(sizeInput.value);
            syncUI();
        });
        undoButton.addEventListener("click", () => {
            const last = state.strokes.pop();
            if (!last) return;
            state.redo.push(last);
            replayCommitted();
            syncUI();
        });
        redoButton.addEventListener("click", () => {
            const next = state.redo.pop();
            if (!next) return;
            state.strokes.push(next);
            replayCommitted();
            syncUI();
        });
        clearButton.addEventListener("click", () => {
            if (!state.strokes.length) return;
            if (!window.confirm("清空整张画板？清空后可用 Ctrl+Y / 重做 逐步恢复。")) return;
            state.redo = state.strokes.slice().reverse().concat(state.redo);
            state.strokes = [];
            replayCommitted();
            syncUI();
        });
        guideInput.addEventListener("change", () => {
            state.guide = guideInput.checked && Boolean(guideImage);
            composite();
        });
        exportSelect.addEventListener("change", () => {
            state.exportMode = exportSelect.value;
        });
        zoomInButton.addEventListener("click", () => zoomAt(1.25));
        zoomOutButton.addEventListener("click", () => zoomAt(1 / 1.25));
        zoomLabel.addEventListener("click", () => resetCamera());
        zoomFitButton.addEventListener("click", () => resetCamera());
        sizeSelect.addEventListener("change", () => {
            const [nextWidth, nextHeight] = sizeSelect.value.split("x").map(Number);
            if (!nextWidth || !nextHeight) return;
            const scaleX = nextWidth / state.width;
            const scaleY = nextHeight / state.height;
            // B4：按比例缩放已有内容，不再清空
            state.strokes = state.strokes.map((op) => ({
                ...op,
                size: op.size ? op.size * ((scaleX + scaleY) / 2) : op.size,
                points: Array.isArray(op.points)
                    ? op.points.map((point) => [point[0] * scaleX, point[1] * scaleY, point[2], point[3]])
                    : op.points,
                path: Array.isArray(op.path) ? op.path.map((point) => [point[0] * scaleX, point[1] * scaleY]) : op.path,
            }));
            state.redo = [];
            state.width = nextWidth;
            state.height = nextHeight;
            [display, committed, liveCanvas].forEach((canvas) => {
                canvas.width = nextWidth;
                canvas.height = nextHeight;
            });
            live = null;
            marquee = null;
            fit();
            replayCommitted();
            syncUI();
        });

        function close() {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("keyup", onKeyUp, true);
            window.removeEventListener("resize", onResize);
            root.remove();
        }

        function finish() {
            // A2：三种导出
            const exportCanvas = document.createElement("canvas");
            exportCanvas.width = state.width;
            exportCanvas.height = state.height;
            const exportContext = exportCanvas.getContext("2d");
            if (state.exportMode !== "alpha") {
                exportContext.fillStyle = "#ffffff";
                exportContext.fillRect(0, 0, state.width, state.height);
            }
            if (state.exportMode === "composite" && guideImage) {
                exportContext.globalAlpha = GUIDE_ALPHA_EXPORT;
                exportContext.drawImage(guideImage, 0, 0, state.width, state.height);
                exportContext.globalAlpha = 1;
            }
            exportContext.drawImage(committed, 0, 0);
            let dataUrl = "";
            try {
                dataUrl = exportCanvas.toDataURL("image/png");
            } catch (error) {
                dataUrl = "";
            }
            close();
            onDone({
                dataUrl,
                width: state.width,
                height: state.height,
                strokes: state.strokes,
                exportMode: state.exportMode,
            });
        }

        cancelButton.addEventListener("click", () => {
            close();
            onCancel?.();
        });
        doneButton.addEventListener("click", finish);
        root.addEventListener("mousedown", (event) => {
            if (event.target === root) {
                close();
                onCancel?.();
            }
        });

        function onKeyDown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
                onCancel?.();
                return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                finish();
                return;
            }
            if (event.code === "Space") {
                if (!spaceDown) {
                    spaceDown = true;
                    syncUI();
                }
                if (event.target === document.body) event.preventDefault();
                return;
            }
            const meta = event.ctrlKey || event.metaKey;
            if (meta && event.key.toLowerCase() === "z") {
                event.preventDefault();
                (event.shiftKey ? redoButton : undoButton).click();
                return;
            }
            if (meta && event.key.toLowerCase() === "y") {
                event.preventDefault();
                redoButton.click();
                return;
            }
            if (meta) return;
            const key = event.key.toLowerCase();
            if (key === "b") paintMode("brush");
            else if (key === "e") paintMode("eraser");
            else if (key === "r") paintMode("select");
            else if (key === "l") paintMode("line");
            else if (key === "u") paintMode("rect");
            else if (key === "o") paintMode("ellipse");
            else if (key === "a") paintMode("arrow");
            else if (key === "t") paintMode("text");
            else if (key === "+" || key === "=") zoomAt(1.25);
            else if (key === "-" || key === "_") zoomAt(1 / 1.25);
            else if (key === "0") resetCamera();
            else if (/^[1-6]$/.test(key)) {
                const entry = PALETTE[Number(key) - 1];
                if (entry) {
                    state.color = entry.color;
                    if (state.tool === "eraser") paintMode("brush");
                    syncUI();
                }
            }
        }

        function onKeyUp(event) {
            if (event.code === "Space") {
                spaceDown = false;
                syncUI();
            }
        }

        function onResize() {
            fit();
        }

        window.addEventListener("keydown", onKeyDown, true);
        window.addEventListener("keyup", onKeyUp, true);
        window.addEventListener("resize", onResize);

        // ---- 底图
        if (guideUrl) {
            guideImage = new Image();
            guideImage.crossOrigin = "anonymous";
            guideImage.onload = () => {
                state.guide = guideInput.checked;
                composite();
            };
            guideImage.onerror = () => {
                guideImage = null;
                state.guide = false;
                guideInput.checked = false;
                guideInput.disabled = true;
                hint.textContent = "底图读取失败（跨域或文件已失效），可继续手绘。";
                composite();
            };
            guideImage.src = guideUrl;
        } else {
            state.guide = false;
        }

        fit();
        replayCommitted();
        syncUI();
    }

    // ---------------------------------------------------------------- 画板内容
    function guideFrom(ctx) {
        const upstream = typeof ctx.getUpstream === "function" ? ctx.getUpstream() || [] : [];
        for (const node of upstream) {
            const content = node?.metadata?.content;
            if (typeof content !== "string" || !content) continue;
            if (node.type === "image" || /^data:image\//.test(content) || /^blob:/.test(content)) return content;
        }
        return "";
    }

    async function loadStrokes(ctx) {
        try {
            const saved = await ctx.storage.get(`${STORE_PREFIX}${ctx.node.id}`);
            if (saved && Array.isArray(saved.strokes)) return saved;
        } catch (error) {
            /* 存储不可用时按空白画板处理 */
        }
        const meta = ctx.node.metadata || {};
        return {
            width: Number(meta.sketchWidth) || SIZES[0].width,
            height: Number(meta.sketchHeight) || SIZES[0].height,
            strokes: [],
            exportMode: typeof meta.sketchExport === "string" ? meta.sketchExport : "white",
        };
    }

    async function openFor(ctx) {
        const saved = await loadStrokes(ctx);
        openSketchEditor({
            width: saved.width,
            height: saved.height,
            strokes: saved.strokes,
            exportMode: saved.exportMode,
            guideUrl: guideFrom(ctx),
            onDone: async ({ dataUrl, width, height, strokes, exportMode }) => {
                try {
                    await ctx.storage.set(`${STORE_PREFIX}${ctx.node.id}`, { width, height, strokes, exportMode });
                } catch (error) {
                    /* 忽略：下次打开会丢失矢量笔画，但 PNG 仍然保留 */
                }
                ctx.updateMetadata({
                    content: dataUrl,
                    mimeType: "image/png",
                    naturalWidth: width,
                    naturalHeight: height,
                    bytes: Math.round((dataUrl.length * 3) / 4),
                    sketchWidth: width,
                    sketchHeight: height,
                    sketchExport: exportMode,
                });
            },
        });
    }

    function Content({ ctx }) {
        const theme = ctx.theme;
        const meta = ctx.node.metadata || {};
        const content = typeof meta.content === "string" ? meta.content : "";
        const width = Number(meta.sketchWidth) || Number(meta.naturalWidth) || 0;
        const height = Number(meta.sketchHeight) || Number(meta.naturalHeight) || 0;
        const hasGuide = Boolean(guideFrom(ctx));
        return h(
            "div",
            { style: { position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" } },
            content
                ? h("img", { src: content, alt: "", draggable: false, style: { width: "100%", height: "100%", objectFit: "contain", background: "#fff" } })
                : h(
                      "div",
                      {
                          style: {
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              width: "100%",
                              height: "100%",
                              color: theme.node.muted,
                              fontSize: 12,
                              background: theme.node.panel,
                          },
                      },
                      h("span", { style: { fontSize: 22 } }, "✏️"),
                      h("span", null, "双击打开画板"),
                      h("span", { style: { fontSize: 11, opacity: 0.7 } }, hasGuide ? "已就绪：可描摹上游图片" : "连一张图片可描摹"),
                  ),
            content
                ? h("div", { style: { position: "absolute", right: 6, bottom: 4, fontSize: 10, color: "#fff", background: "rgba(0,0,0,.55)", borderRadius: 4, padding: "1px 5px" } }, width && height ? `${width}×${height}` : hasGuide ? "含底图" : "")
                : null,
        );
    }

    return {
        id: "sketch-pad",
        name: "手绘画板",
        version: "1.2.0",
        description: "手绘画板：缩放描摹、彩色标注、套索填充/擦空、直线/矩形/椭圆/箭头/文字，可导出线稿或合成图。",
        defaultEnabled: true,
        css: `
            .sk-root { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; background: rgba(8,10,14,.78); font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e6e9ef; }
            .sk-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: #141821; border: 1px solid #2a3040; box-shadow: 0 24px 70px rgba(0,0,0,.6); max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); }
            .sk-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .sk-group { display: flex; align-items: center; gap: 4px; padding: 2px; border-radius: 8px; background: #1b2130; }
            .sk-btn { appearance: none; border: 1px solid transparent; background: transparent; color: #e6e9ef; font: inherit; padding: 5px 9px; border-radius: 6px; cursor: pointer; }
            .sk-btn:hover { background: #232b3d; }
            .sk-btn[data-active="true"] { background: #2f6df6; border-color: #4b83ff; color: #fff; }
            .sk-btn:disabled { opacity: .4; cursor: default; }
            .sk-mini { padding: 4px 8px; font-variant-numeric: tabular-nums; }
            .sk-primary { background: #2f6df6; border-color: #4b83ff; color: #fff; font-weight: 600; }
            .sk-primary:hover { background: #3a78ff; }
            .sk-ghost { border-color: #333c50; }
            .sk-field { display: flex; align-items: center; gap: 6px; padding: 0 8px; }
            .sk-field-label { color: #9aa4b8; white-space: nowrap; }
            .sk-range { width: 110px; accent-color: #2f6df6; }
            .sk-select { appearance: none; background: #1b2130; color: #e6e9ef; border: 1px solid #2c3446; border-radius: 6px; padding: 5px 8px; font: inherit; }
            .sk-check { display: flex; align-items: center; gap: 5px; color: #9aa4b8; white-space: nowrap; }
            .sk-check input { accent-color: #2f6df6; }
            .sk-colors { gap: 3px; padding: 3px 4px; }
            .sk-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
            .sk-swatch[data-active="true"] { border-color: #fff; box-shadow: 0 0 0 1px #2f6df6; }
            .sk-spacer { flex: 1 1 auto; }
            .sk-viewport { position: relative; overflow: hidden; border-radius: 10px; background: #0d1017; max-width: calc(100vw - 48px); max-height: calc(100vh - 240px); }
            .sk-stage { position: relative; border-radius: 4px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1px #2a3040 inset, 0 6px 24px rgba(0,0,0,.45); touch-action: none; will-change: transform; }
            .sk-stage canvas { display: block; }
            .sk-hint { color: #7f899c; font-size: 11px; }
        `,
        nodes: [
            {
                type: NODE_TYPE,
                title: "画板",
                icon: h("span", { style: { fontSize: 14 } }, "✏️"),
                description: "手绘/描摹线稿，直接作为参考图出图",
                defaultSize: { width: 320, height: 300 },
                defaultMetadata: { content: "", sketchWidth: SIZES[0].width, sketchHeight: SIZES[0].height, sketchExport: "white" },
                minimapColor: "#f0b429",
                resource: (node) => {
                    const content = node?.metadata?.content;
                    return typeof content === "string" && content ? { kind: "image", url: content } : null;
                },
                Content,
                onDoubleClick: (ctx) => {
                    openFor(ctx);
                    return true;
                },
                toolbar: (ctx) => [
                    {
                        id: "sketch-edit",
                        title: "打开画板",
                        label: "画板",
                        icon: h("span", { style: { fontSize: 13 } }, "✏️"),
                        onClick: () => openFor(ctx),
                    },
                    {
                        id: "sketch-to-image",
                        title: "导出为图片节点（可继续裁剪/局部重绘/超分）",
                        label: "导出图片",
                        icon: h("span", { style: { fontSize: 13 } }, "🖼"),
                        onClick: () => {
                            const meta = ctx.node.metadata || {};
                            const content = typeof meta.content === "string" ? meta.content : "";
                            if (!content) {
                                window.alert("画板还是空的，先双击画板画点东西。");
                                return;
                            }
                            const mode = typeof meta.sketchExport === "string" ? meta.sketchExport : "white";
                            const suffix = mode === "composite" ? "合成" : mode === "alpha" ? "透明线稿" : "线稿";
                            ctx.applyOps([
                                {
                                    type: "add_node",
                                    nodeType: "image",
                                    title: `${ctx.node.title || "画板"} ${suffix}`,
                                    x: (ctx.node.position?.x || 0) + (ctx.node.width || 320) + 60,
                                    y: ctx.node.position?.y || 0,
                                    width: 320,
                                    height: 320,
                                    metadata: {
                                        content,
                                        mimeType: "image/png",
                                        naturalWidth: Number(meta.sketchWidth) || 1024,
                                        naturalHeight: Number(meta.sketchHeight) || 1024,
                                        bytes: Math.round((content.length * 3) / 4),
                                    },
                                },
                            ]);
                        },
                    },
                    {
                        id: "sketch-clear",
                        title: "清空画板（清空后可重新画，不可撤销）",
                        label: "清空",
                        icon: h("span", { style: { fontSize: 13 } }, "🗑"),
                        danger: true,
                        onClick: async () => {
                            if (!window.confirm("清空这张画板？")) return;
                            try {
                                await ctx.storage.remove(`${STORE_PREFIX}${ctx.node.id}`);
                            } catch (error) {
                                /* 忽略 */
                            }
                            ctx.updateMetadata({ content: "", bytes: 0 });
                        },
                    },
                ],
            },
        ],
    };
}
