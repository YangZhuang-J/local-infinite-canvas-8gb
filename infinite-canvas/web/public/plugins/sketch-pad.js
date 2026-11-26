/**
 * 手绘画板节点（sketch:pad）
 *
 * 用途：手绘/描摹线稿 → 直接当「参考图片」参与生成（连到生成配置或图片卡即可），
 *       或点「导出为图片卡」变成普通图片节点，继续走裁剪/局部重绘/超分等链路。
 *
 * 交互：双击画板卡片（或悬浮工具条「打开画板」）→ 全屏画板 → 完成保存。
 *       把一张图片连到画板节点上，画板会把它作为 30% 半透明底图供描摹（可开关）。
 *
 * 笔触：内联 vendor 了 perfect-freehand（MIT License, Copyright (c) 2021 Stephen Ruiz Ltd），
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
    ];
    const BRUSH_MIN = 2;
    const BRUSH_MAX = 48;
    const GUIDE_ALPHA = 0.28;

    // ---------------------------------------------------------------- 笔触引擎
    // ---- vendor: perfect-freehand 1.2.3 (MIT License, Copyright (c) 2021 Stephen Ruiz Ltd) ----
    // https://github.com/steveruizok/perfect-freehand —— 内联以便离线运行。
    const PerfectFreehand = (function () {
        const exports = {};
        Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:`Module`}});const{PI:e}=Math,t=e+1e-4,n=.5,r=[1,1];function i(e,t,n,r=e=>e){return e*r(.5-t*(.5-n))}const{min:a}=Math;function o(e,t,n){let r=a(1,t/n);return a(1,e+(a(1,1-r)-e)*(r*.275))}function s(e){return[-e[0],-e[1]]}function c(e,t){return[e[0]+t[0],e[1]+t[1]]}function l(e,t,n){return e[0]=t[0]+n[0],e[1]=t[1]+n[1],e}function u(e,t){return[e[0]-t[0],e[1]-t[1]]}function d(e,t,n){return e[0]=t[0]-n[0],e[1]=t[1]-n[1],e}function f(e,t){return[e[0]*t,e[1]*t]}function p(e,t,n){return e[0]=t[0]*n,e[1]=t[1]*n,e}function m(e,t){return[e[0]/t,e[1]/t]}function h(e){return[e[1],-e[0]]}function g(e,t){let n=t[0];return e[0]=t[1],e[1]=-n,e}function ee(e,t){return e[0]*t[0]+e[1]*t[1]}function _(e,t){return e[0]===t[0]&&e[1]===t[1]}function v(e){return Math.hypot(e[0],e[1])}function y(e,t){let n=e[0]-t[0],r=e[1]-t[1];return n*n+r*r}function b(e){return m(e,v(e))}function x(e,t){return Math.hypot(e[1]-t[1],e[0]-t[0])}function S(e,t,n){let r=Math.sin(n),i=Math.cos(n),a=e[0]-t[0],o=e[1]-t[1],s=a*i-o*r,c=a*r+o*i;return[s+t[0],c+t[1]]}function C(e,t,n,r){let i=Math.sin(r),a=Math.cos(r),o=t[0]-n[0],s=t[1]-n[1],c=o*a-s*i,l=o*i+s*a;return e[0]=c+n[0],e[1]=l+n[1],e}function w(e,t,n){return c(e,f(u(t,e),n))}function te(e,t,n,r){let i=n[0]-t[0],a=n[1]-t[1];return e[0]=t[0]+i*r,e[1]=t[1]+a*r,e}function T(e,t,n){return c(e,f(t,n))}const E=[0,0],D=[0,0],O=[0,0];function k(e,n){let r=T(e,b(h(u(e,c(e,[1,1])))),-n),i=[],a=1/13;for(let n=a;n<=1;n+=a)i.push(S(r,e,t*2*n));return i}function A(e,n,r){let i=[],a=1/r;for(let r=a;r<=1;r+=a)i.push(S(n,e,t*r));return i}function j(e,t,n){let r=u(t,n),i=f(r,.5),a=f(r,.51);return[u(e,i),u(e,a),c(e,a),c(e,i)]}function M(e,n,r,i){let a=[],o=T(e,n,r),s=1/i;for(let n=s;n<1;n+=s)a.push(S(o,e,t*3*n));return a}function ne(e,t,n){return[c(e,f(t,n)),c(e,f(t,n*.99)),u(e,f(t,n*.99)),u(e,f(t,n))]}function N(e,t,n){return e===!1||e===void 0?0:e===!0?Math.max(t,n):e}function re(e,t,n){return e.slice(0,10).reduce((e,r)=>{let i=r.pressure;return t&&(i=o(e,r.distance,n)),(e+i)/2},e[0].pressure)}function P(e,n={}){let{size:r=16,smoothing:a=.5,thinning:f=.5,simulatePressure:m=!0,easing:_=e=>e,start:v={},end:b={},last:x=!1}=n,{cap:S=!0,easing:w=e=>e*(2-e)}=v,{cap:T=!0,easing:P=e=>--e*e*e+1}=b;if(e.length===0||r<=0)return[];let F=e[e.length-1].runningLength,I=N(v.taper,r,F),L=N(b.taper,r,F),R=(r*a)**2,z=[],B=[],V=re(e,m,r),H=i(r,f,e[e.length-1].pressure,_),U,W=e[0].vector,G=e[0].point,K=G,q=G,J=K,Y=!1;for(let n=0;n<e.length;n++){let{pressure:a}=e[n],{point:s,vector:h,distance:v,runningLength:b}=e[n],x=n===e.length-1;if(!x&&F-b<3)continue;f?(m&&(a=o(V,v,r)),H=i(r,f,a,_)):H=r/2,U===void 0&&(U=H);let S=b<I?w(b/I):1,T=F-b<L?P((F-b)/L):1;H=Math.max(.01,H*Math.min(S,T));let k=(x?e[n]:e[n+1]).vector,A=x?1:ee(h,k),j=ee(h,W)<0&&!Y,M=A!==null&&A<0;if(j||M){g(E,W),p(E,E,H);for(let e=0;e<=1;e+=.07692307692307693)d(D,s,E),C(D,D,s,t*e),q=[D[0],D[1]],z.push(q),l(O,s,E),C(O,O,s,t*-e),J=[O[0],O[1]],B.push(J);G=q,K=J,M&&(Y=!0);continue}if(Y=!1,x){g(E,h),p(E,E,H),z.push(u(s,E)),B.push(c(s,E));continue}te(E,k,h,A),g(E,E),p(E,E,H),d(D,s,E),q=[D[0],D[1]],(n<=1||y(G,q)>R)&&(z.push(q),G=q),l(O,s,E),J=[O[0],O[1]],(n<=1||y(K,J)>R)&&(B.push(J),K=J),V=a,W=h}let X=[e[0].point[0],e[0].point[1]],Z=e.length>1?[e[e.length-1].point[0],e[e.length-1].point[1]]:c(e[0].point,[1,1]),Q=[],$=[];if(e.length===1){if(!(I||L)||x)return k(X,U||H)}else{I||L&&e.length===1||(S?Q.push(...A(X,B[0],13)):Q.push(...j(X,z[0],B[0])));let t=h(s(e[e.length-1].vector));L||I&&e.length===1?$.push(Z):T?$.push(...M(Z,t,H,29)):$.push(...ne(Z,t,H))}return z.concat($,B.reverse(),Q)}const F=[0,0];function I(e){return e!=null&&e>=0}function L(e,t={}){let{streamline:i=.5,size:a=16,last:o=!1}=t;if(e.length===0)return[];let s=.15+(1-i)*.85,l=Array.isArray(e[0])?e:e.map(({x:e,y:t,pressure:r=n})=>[e,t,r]);if(l.length===2){let e=l[1];l=l.slice(0,-1);for(let t=1;t<5;t++)l.push(w(l[0],e,t/4))}l.length===1&&(l=[...l,[...c(l[0],r),...l[0].slice(2)]]);let u=[{point:[l[0][0],l[0][1]],pressure:I(l[0][2])?l[0][2]:.25,vector:[...r],distance:0,runningLength:0}],f=!1,p=0,m=u[0],h=l.length-1;for(let e=1;e<l.length;e++){let t=o&&e===h?[l[e][0],l[e][1]]:w(m.point,l[e],s);if(_(m.point,t))continue;let r=x(t,m.point);if(p+=r,e<h&&!f){if(p<a)continue;f=!0}d(F,m.point,t),m={point:t,pressure:I(l[e][2])?l[e][2]:n,vector:b(F),distance:r,runningLength:p},u.push(m)}return u[0].vector=u[1]?.vector||[0,0],u}function R(e,t={}){return P(L(e,t),t)}var z=R;exports.default=z,exports.getStroke=R,exports.getStrokeOutlinePoints=P,exports.getStrokePoints=L;
        return exports;
    })();
    const getStroke = (typeof PerfectFreehand !== "undefined" && PerfectFreehand.getStroke) || null;

    const strokeOptions = (size) => ({
        size,
        thinning: 0.55,
        smoothing: 0.55,
        streamline: 0.45,
        simulatePressure: false,
        easing: (t) => t,
        start: { taper: 0, cap: true },
        end: { taper: size * 0.35, cap: true },
    });

    function outlineFor(stroke) {
        if (!getStroke) return null;
        const points = stroke.points.map((point) => [point[0], point[1], point[2]]);
        return getStroke(points, strokeOptions(stroke.size));
    }

    function drawStroke(context, stroke) {
        const outline = outlineFor(stroke);
        if (!outline || outline.length < 2) {
            // 没有笔触引擎时退化为等宽线条，避免画不出来。
            context.save();
            context.globalCompositeOperation = stroke.mode === "eraser" ? "destination-out" : "source-over";
            context.strokeStyle = "#111";
            context.lineWidth = stroke.size;
            context.lineCap = "round";
            context.lineJoin = "round";
            context.beginPath();
            stroke.points.forEach((point, index) => {
                if (index === 0) context.moveTo(point[0], point[1]);
                else context.lineTo(point[0], point[1]);
            });
            context.stroke();
            context.restore();
            return;
        }
        context.save();
        context.globalCompositeOperation = stroke.mode === "eraser" ? "destination-out" : "source-over";
        context.fillStyle = "#111111";
        context.beginPath();
        const first = outline[0];
        context.moveTo(first[0], first[1]);
        for (let index = 1; index < outline.length; index += 1) {
            const point = outline[index];
            context.lineTo(point[0], point[1]);
        }
        context.closePath();
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

    function openSketchEditor({ width, height, strokes, guideUrl, onCancel, onDone }) {
        const state = {
            width: width || SIZES[0].width,
            height: height || SIZES[0].height,
            strokes: Array.isArray(strokes) ? strokes : [],
            redo: [],
            tool: "brush",
            brush: 10,
            guide: Boolean(guideUrl),
        };
        let scale = 1;
        let live = null;
        let guideImage = null;

        const root = el("div", "sk-root");
        const panel = el("div", "sk-panel");
        const bar = el("div", "sk-bar");
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

        // ---- 工具条
        const toolGroup = el("div", "sk-group");
        const brushButton = el("button", "sk-btn", "笔刷 B");
        const eraserButton = el("button", "sk-btn", "橡皮 E");
        brushButton.type = "button";
        eraserButton.type = "button";
        toolGroup.append(brushButton, eraserButton);

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

        const historyGroup = el("div", "sk-group");
        const undoButton = el("button", "sk-btn", "撤销");
        const redoButton = el("button", "sk-btn", "重做");
        const clearButton = el("button", "sk-btn", "清空");
        [undoButton, redoButton, clearButton].forEach((button) => {
            button.type = "button";
        });
        historyGroup.append(undoButton, redoButton, clearButton);

        const sizeSelect = document.createElement("select");
        sizeSelect.className = "sk-select";
        SIZES.forEach((size) => {
            const option = document.createElement("option");
            option.value = `${size.width}x${size.height}`;
            option.textContent = size.label;
            sizeSelect.appendChild(option);
        });
        sizeSelect.value = `${state.width}x${state.height}`;

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

        bar.append(toolGroup, sizeWrap, historyGroup, sizeSelect, guideWrap, spacer, cancelButton, doneButton);
        panel.append(bar, stage, hint);
        root.appendChild(panel);
        document.body.appendChild(root);

        hint.textContent = `在画布上绘制线稿；导出的 PNG 白底黑线，可直接作为参考图或接 ControlNet。Ctrl+Z 撤销 · B 笔刷 · E 橡皮 · Esc 取消 · Enter 完成`;

        // ---- 画布铺排
        const displayContext = display.getContext("2d");
        const committedContext = committed.getContext("2d", { willReadFrequently: false });
        const liveContext = liveCanvas.getContext("2d");

        function fit() {
            const maxWidth = window.innerWidth - 80;
            const maxHeight = window.innerHeight - 190;
            scale = Math.max(0.1, Math.min(maxWidth / state.width, maxHeight / state.height, 1));
            stage.style.width = `${Math.round(state.width * scale)}px`;
            stage.style.height = `${Math.round(state.height * scale)}px`;
            display.style.width = "100%";
            display.style.height = "100%";
            [committed, liveCanvas].forEach((canvas) => {
                canvas.style.width = "100%";
                canvas.style.height = "100%";
            });
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
            state.strokes.forEach((stroke) => drawStroke(committedContext, stroke));
            composite();
        }

        function drawLive() {
            liveContext.clearRect(0, 0, state.width, state.height);
            if (live) drawStroke(liveContext, live);
            composite();
        }

        function syncUI() {
            brushButton.dataset.active = String(state.tool === "brush");
            eraserButton.dataset.active = String(state.tool === "eraser");
            sizeLabel.textContent = `粗细 ${state.brush}`;
            undoButton.disabled = state.strokes.length === 0;
            redoButton.disabled = state.redo.length === 0;
            clearButton.disabled = state.strokes.length === 0;
            guideInput.checked = state.guide;
            if (guideImage) {
                guideInput.checked = state.guide;
            }
        }

        // ---- 指针绘制
        function pointFrom(event) {
            const rect = display.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * state.width;
            const y = ((event.clientY - rect.top) / rect.height) * state.height;
            const pressure = event.pressure > 0 && event.pressure !== 0.5 ? event.pressure : event.pointerType === "pen" ? 0.5 : 0.5;
            return [Math.max(0, Math.min(state.width, x)), Math.max(0, Math.min(state.height, y)), pressure];
        }

        function onPointerDown(event) {
            if (event.button !== 0 && event.pointerType === "mouse") return;
            event.preventDefault();
            display.setPointerCapture?.(event.pointerId);
            live = { mode: state.tool === "eraser" ? "eraser" : "brush", size: state.brush, points: [pointFrom(event)] };
            drawLive();
        }

        function onPointerMove(event) {
            if (!live) return;
            const point = pointFrom(event);
            const last = live.points[live.points.length - 1];
            if (Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) < 1.2 / scale) return;
            live.points.push(point);
            drawLive();
        }

        function onPointerUp() {
            if (!live) return;
            if (live.points.length === 1) {
                const only = live.points[0];
                live.points.push([only[0] + 0.6, only[1] + 0.6, only[2]]);
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

        // ---- 按钮
        function paintMode(mode) {
            state.tool = mode;
            syncUI();
        }

        brushButton.addEventListener("click", () => paintMode("brush"));
        eraserButton.addEventListener("click", () => paintMode("eraser"));
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
            if (!window.confirm("清空整张画板？清空后可用 Ctrl+Y / 重做 逐步恢复笔画。")) return;
            state.redo = state.strokes.slice().reverse().concat(state.redo);
            state.strokes = [];
            replayCommitted();
            syncUI();
        });
        guideInput.addEventListener("change", () => {
            state.guide = guideInput.checked && Boolean(guideImage);
            composite();
        });
        sizeSelect.addEventListener("change", () => {
            const [nextWidth, nextHeight] = sizeSelect.value.split("x").map(Number);
            if (!nextWidth || !nextHeight) return;
            if (state.strokes.length && !window.confirm("更改画布尺寸会清空当前笔画，继续？")) {
                sizeSelect.value = `${state.width}x${state.height}`;
                return;
            }
            state.width = nextWidth;
            state.height = nextHeight;
            [display, committed, liveCanvas].forEach((canvas) => {
                canvas.width = nextWidth;
                canvas.height = nextHeight;
            });
            state.strokes = [];
            state.redo = [];
            live = null;
            fit();
            replayCommitted();
            syncUI();
        });

        function close() {
            window.removeEventListener("keydown", onKeyDown, true);
            window.removeEventListener("resize", onResize);
            root.remove();
        }

        function finish() {
            const exportCanvas = document.createElement("canvas");
            exportCanvas.width = state.width;
            exportCanvas.height = state.height;
            const exportContext = exportCanvas.getContext("2d");
            exportContext.fillStyle = "#ffffff";
            exportContext.fillRect(0, 0, state.width, state.height);
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
            if (!meta && event.key.toLowerCase() === "b") paintMode("brush");
            if (!meta && event.key.toLowerCase() === "e") paintMode("eraser");
        }

        function onResize() {
            fit();
        }

        window.addEventListener("keydown", onKeyDown, true);
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
        syncUI();
        replayCommitted();
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
        };
    }

    async function openFor(ctx) {
        const saved = await loadStrokes(ctx);
        openSketchEditor({
            width: saved.width,
            height: saved.height,
            strokes: saved.strokes,
            guideUrl: guideFrom(ctx),
            onDone: async ({ dataUrl, width, height, strokes }) => {
                try {
                    await ctx.storage.set(`${STORE_PREFIX}${ctx.node.id}`, { width, height, strokes });
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
        version: "1.0.0",
        description: "手绘/描摹线稿，作为参考图参与生成，或导出成图片节点。",
        defaultEnabled: true,
        css: `
            .sk-root { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; background: rgba(8,10,14,.78); font: 12px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #e6e9ef; }
            .sk-panel { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 14px; background: #141821; border: 1px solid #2a3040; box-shadow: 0 24px 70px rgba(0,0,0,.6); max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); }
            .sk-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .sk-group { display: flex; align-items: center; gap: 4px; padding: 2px; border-radius: 8px; background: #1b2130; }
            .sk-btn { appearance: none; border: 1px solid transparent; background: transparent; color: #e6e9ef; font: inherit; padding: 5px 9px; border-radius: 6px; cursor: pointer; }
            .sk-btn:hover { background: #232b3d; }
            .sk-btn[data-active="true"] { background: #2f6df6; border-color: #4b83ff; color: #fff; }
            .sk-btn:disabled { opacity: .4; cursor: default; }
            .sk-primary { background: #2f6df6; border-color: #4b83ff; color: #fff; font-weight: 600; }
            .sk-primary:hover { background: #3a78ff; }
            .sk-ghost { border-color: #333c50; }
            .sk-field { display: flex; align-items: center; gap: 6px; padding: 0 8px; }
            .sk-field-label { color: #9aa4b8; white-space: nowrap; }
            .sk-range { width: 110px; accent-color: #2f6df6; }
            .sk-select { appearance: none; background: #1b2130; color: #e6e9ef; border: 1px solid #2c3446; border-radius: 6px; padding: 5px 8px; font: inherit; }
            .sk-check { display: flex; align-items: center; gap: 5px; color: #9aa4b8; white-space: nowrap; }
            .sk-check input { accent-color: #2f6df6; }
            .sk-spacer { flex: 1 1 auto; }
            .sk-stage { position: relative; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 0 0 1px #2a3040 inset, 0 2px 12px rgba(0,0,0,.35); touch-action: none; cursor: crosshair; }
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
                defaultMetadata: { content: "", sketchWidth: SIZES[0].width, sketchHeight: SIZES[0].height },
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
                            ctx.applyOps([
                                {
                                    type: "add_node",
                                    nodeType: "image",
                                    title: `${ctx.node.title || "画板"} 线稿`,
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
