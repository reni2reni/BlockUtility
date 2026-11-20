/* global BF2042Portal, _Blockly */
(function () {
    "use strict";

    // BlockUtility: BF2042 Portal 用の独立ユーティリティプラグイン
    const plugin = BF2042Portal.Plugins.getPlugin("BlockUtility");
    let menusRegistered = false;
    let wheelListenerAttached = false;
    // ===== ミニマップ関連変数 =====
    let minimapButton = null;
    let minimapPanel = null;
    let minimapCanvas = null;
    let minimapIsOpen = false;
    let minimapAnimId = null;

    function getPortalLanguage() {
        const candidates = [
            document && document.documentElement ? document.documentElement.lang : "",
            typeof navigator !== "undefined" ? navigator.language : ""
        ];
        const lang = candidates.find(v => typeof v === "string" && v.trim()) || "";
        return lang.toLowerCase().startsWith("ja") ? "ja" : "en";
    }

    function getSubroutineInstanceName(block) {
        if (!block || block.type !== "subroutineInstanceBlock") return null;
        try {
            const field = typeof block.getField === "function" ? block.getField("SUBROUTINE_NAME") : null;
            const value = field && typeof field.getValue === "function" ? field.getValue() : null;
            if (value != null && String(value).trim() !== "") return String(value);
        } catch (_) { }
        const extraName = block.extraState && block.extraState.subroutineName;
        return extraName != null && String(extraName).trim() !== "" ? String(extraName) : null;
    }

    function getSubroutineBlockName(block) {
        if (!block || block.type !== "subroutineBlock") return null;
        try {
            const field = typeof block.getField === "function" ? block.getField("SUBROUTINE_NAME") : null;
            const value = field && typeof field.getValue === "function" ? field.getValue() : null;
            if (value != null && String(value).trim() !== "") return String(value);
        } catch (_) { }
        const extraName = block.extraState && block.extraState.subroutineName;
        return extraName != null && String(extraName).trim() !== "" ? String(extraName) : null;
    }

    function centerOnBlock(block) {
        if (!block) return false;
        const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
        if (!ws) return false;
        try {
            if (typeof ws.centerOnBlock === "function" && block.id != null) {
                ws.centerOnBlock(block.id);
                return true;
            }
        } catch (_) { }
        return false;
    }

    function selectAndCenter(block) {
        if (!block) return false;
        try {
            if (typeof block.select === "function") {
                block.select();
            } else if (_Blockly.common && typeof _Blockly.common.setSelected === "function") {
                _Blockly.common.setSelected(block);
            } else {
                return false;
            }
            centerOnBlock(block);
            return true;
        } catch (_) {
            return false;
        }
    }

    function getBlockCenter(block) {
        if (!block || typeof block.getRelativeToSurfaceXY !== "function") return null;
        try {
            const pos = block.getRelativeToSurfaceXY();
            let width = 0;
            let height = 0;
            try {
                const rect = typeof block.getBoundingRectangle === "function"
                    ? block.getBoundingRectangle() : null;
                if (rect) {
                    width = Number(rect.getWidth ? rect.getWidth() : rect.width) || 0;
                    height = Number(rect.getHeight ? rect.getHeight() : rect.height) || 0;
                }
            } catch (_) { }
            return { x: Number(pos.x) + width / 2, y: Number(pos.y) + height / 2 };
        } catch (_) {
            return null;
        }
    }

    function getBlocksInVisualOrder(blocks) {
        return blocks.slice().sort((a, b) => {
            const pa = getBlockCenter(a);
            const pb = getBlockCenter(b);
            if (!pa && !pb) return 0;
            if (!pa) return 1;
            if (!pb) return -1;
            if (Math.abs(pa.y - pb.y) > 1) return pa.y - pb.y;
            return pa.x - pb.x;
        });
    }

    // subroutineInstanceBlock → 同名 subroutineBlock を順番に巡回
    const subroutineTargetCycle = new Map();

    function goToSubroutineBlock(block) {
        if (!block || block.type !== "subroutineInstanceBlock") return false;
        const name = getSubroutineInstanceName(block);
        if (!name) return false;

        const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
        if (!ws || typeof ws.getAllBlocks !== "function") return false;

        const targets = getBlocksInVisualOrder(ws.getAllBlocks(false).filter(candidate =>
            candidate && candidate.type === "subroutineBlock" &&
            getSubroutineBlockName(candidate) === name
        ));
        if (!targets.length) return false;

        const key = String(block.id || name);
        const previousId = subroutineTargetCycle.get(key);
        let index = previousId
            ? targets.findIndex(target => String(target.id) === String(previousId)) + 1
            : 0;
        if (index >= targets.length) index = 0;

        const target = targets[index];
        if (!selectAndCenter(target)) return false;
        subroutineTargetCycle.set(key, target.id);
        return true;
    }

    // subroutineBlock → 同名 subroutineInstanceBlock のうち最も近い1個
    function goToSubroutineSource(block) {
        if (!block || block.type !== "subroutineBlock") return false;
        const name = getSubroutineBlockName(block);
        if (!name) return false;

        const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
        if (!ws || typeof ws.getAllBlocks !== "function") return false;

        const sources = ws.getAllBlocks(false).filter(candidate =>
            candidate && candidate.type === "subroutineInstanceBlock" &&
            getSubroutineInstanceName(candidate) === name
        );
        if (!sources.length) return false;

        const sourcePos = getBlockCenter(block);
        let target = null;
        let bestDistance = Infinity;
        for (const source of sources) {
            const pos = getBlockCenter(source);
            if (!sourcePos || !pos) continue;
            const dx = pos.x - sourcePos.x;
            const dy = pos.y - sourcePos.y;
            const distance = dx * dx + dy * dy;
            if (distance < bestDistance) {
                bestDistance = distance;
                target = source;
            }
        }
        if (!target) target = sources[0];
        return selectAndCenter(target);
    }

    // ルール番号: 現在の名前から既存の「01:」等を除去
    function stripRuleNumber(name) {
        return String(name == null ? "" : name).replace(/^\d{1,3}:?\s*/, "");
    }

    function getRuleBlockParentMod(block) {
        if (!block || block.type !== "ruleBlock") return null;
        try {
            if (typeof block.getSurroundParent === "function") {
                let parent = block.getSurroundParent();
                while (parent) {
                    if (parent.type === "modBlock") return parent;
                    parent = typeof parent.getSurroundParent === "function"
                        ? parent.getSurroundParent() : null;
                }
            }
        } catch (_) { }
        return null;
    }

    function getRuleBlockName(block) {
        try {
            const field = block && typeof block.getField === "function" ? block.getField("NAME") : null;
            return field && typeof field.getValue === "function" ? String(field.getValue() || "") : "";
        } catch (_) {
            return "";
        }
    }

    function setRuleBlockName(block, name) {
        try {
            const field = block && typeof block.getField === "function" ? block.getField("NAME") : null;
            if (field && typeof field.setValue === "function") {
                field.setValue(name);
                return true;
            }
        } catch (_) { }
        return false;
    }

    function getRuleBlocksInMod(modBlock) {
        if (!modBlock) return [];
        const blocks = [];
        try {
            if (typeof modBlock.getDescendants === "function") {
                for (const block of modBlock.getDescendants(false)) {
                    if (block && block.type === "ruleBlock") blocks.push(block);
                }
            } else if (typeof modBlock.getChildren === "function") {
                const walk = block => {
                    if (!block) return;
                    if (block.type === "ruleBlock") blocks.push(block);
                    if (typeof block.getChildren === "function") {
                        for (const child of block.getChildren(false)) walk(child);
                    }
                };
                for (const child of modBlock.getChildren(false)) walk(child);
            }
        } catch (_) { }

        return getBlocksInVisualOrder(blocks);
    }

    function renumberRulesInMod(modBlock) {
        const rules = getRuleBlocksInMod(modBlock);
        rules.forEach((rule, index) => {
            const baseName = stripRuleNumber(getRuleBlockName(rule));
            const prefix = String(index + 1).padStart(2, "0");
            setRuleBlockName(rule, prefix + ":" + baseName);
        });
        return rules.length;
    }

    function subroutineText(direction) {
        const ja = getPortalLanguage() === "ja";
        return direction === "source"
            ? (ja ? "呼び出し元へ移動" : "Go to the caller")
            : (ja ? "サブルーチンへ移動" : "Go to Subroutine");
    }

    function ruleNumberText() {
        return getPortalLanguage() === "ja" ? "ルール番号付加" : "Add Rule Numbers";
    }


    // ===== ブロック検索パネル =====
    let blockSearchPanel = null;
    let blockSearchInput = null;
    let blockSearchResult = null;
    let blockSearchMatches = [];
    let blockSearchIndex = 0;
    let blockSearchHighlight = null;
    let blockSearchHighlightStyles = [];
    let blockSearchDragState = null;

    function searchTextForBlock(block) {
        if (!block) return "";
        const parts = [];
        try {
            if (block.type) parts.push(String(block.type));
            if (typeof block.toString === "function") parts.push(String(block.toString()));
        } catch (_) { }
        try {
            if (Array.isArray(block.inputList)) {
                for (const input of block.inputList) {
                    if (!input || !Array.isArray(input.fieldRow)) continue;
                    for (const field of input.fieldRow) {
                        if (!field) continue;
                        try {
                            if (typeof field.getText === "function") parts.push(String(field.getText() || ""));
                            else if (typeof field.getValue === "function") parts.push(String(field.getValue() || ""));
                        } catch (_) { }
                    }
                }
            }
        } catch (_) { }
        return parts.join(" ").toLowerCase();
    }

    function removeBlockSearchHighlight() {
        for (const item of blockSearchHighlightStyles) {
            try {
                if (item.node && item.node.style) {
                    item.node.style.stroke = item.stroke;
                    item.node.style.strokeWidth = item.strokeWidth;
                    item.node.style.strokeOpacity = item.strokeOpacity;
                    item.node.style.vectorEffect = item.vectorEffect;
                    item.node.style.filter = item.filter;
                }
            } catch (_) { }
        }
        blockSearchHighlightStyles = [];
        blockSearchHighlight = null;
    }

    function updateBlockSearchHighlight(block) {
        removeBlockSearchHighlight();
        if (!block || typeof block.getSvgRoot !== "function") return;
        const root = block.getSvgRoot();
        if (!root) return;

        const nodes = root.querySelectorAll
            ? root.querySelectorAll("path, rect, polygon, polyline, line")
            : [];
        for (const node of nodes) {
            if (!node || !node.style) continue;
            blockSearchHighlightStyles.push({
                node,
                stroke: node.style.stroke,
                strokeWidth: node.style.strokeWidth,
                strokeOpacity: node.style.strokeOpacity,
                vectorEffect: node.style.vectorEffect,
                filter: node.style.filter
            });
            node.style.stroke = "#55dfff";
            node.style.strokeWidth = "3px";
            node.style.strokeOpacity = "1";
            node.style.vectorEffect = "non-scaling-stroke";
            node.style.filter = "drop-shadow(0 0 3px rgba(85,223,255,.9))";
        }
        blockSearchHighlight = root;
    }

    function getBlockSearchSeed(block) {
        if (!block) return "";

        const fields = [];
        try {
            if (Array.isArray(block.inputList)) {
                for (const input of block.inputList) {
                    if (!input || !Array.isArray(input.fieldRow)) continue;
                    for (const field of input.fieldRow) {
                        if (!field) continue;
                        let text = "";
                        try {
                            if (typeof field.getText === "function") text = String(field.getText() || "").trim();
                            if (!text && typeof field.getValue === "function") text = String(field.getValue() || "").trim();
                        } catch (_) { }
                        if (!text) continue;
                        const name = String(field.name || "").toUpperCase();
                        fields.push({ field, name, text });
                    }
                }
            }
        } catch (_) { }

        const preferred = fields.find(item =>
            /SUBROUTINE|VARIABLE|VAR|TEXT|STRING|NAME/.test(item.name)
        );
        if (preferred) return preferred.text;

        const editable = fields.find(item => {
            try {
                return item.field.EDITABLE === true ||
                    typeof item.field.showEditor_ === "function";
            } catch (_) {
                return false;
            }
        });
        if (editable) return editable.text;

        return fields.length ? fields[0].text : "";
    }

    function prepareSearchTarget(block) {
        if (!block) return false;

        try {
            const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
            for (const candidate of ws?.getAllBlocks?.(false) || []) {
                try {
                    if (typeof candidate.unselect === "function") candidate.unselect();
                } catch (_) { }
            }
        } catch (_) { }

        removeBlockSearchHighlight();
        centerOnBlock(block);
        updateBlockSearchHighlight(block);
        return true;
    }

    function getSearchDescendants(block) {
        const descendants = [];
        if (!block) return descendants;
        try {
            if (typeof block.getDescendants === "function") {
                for (const child of block.getDescendants(false) || []) {
                    if (child && child !== block) descendants.push(child);
                }
                return descendants;
            }
        } catch (_) { }
        try {
            const walk = current => {
                if (!current || typeof current.getChildren !== "function") return;
                for (const child of current.getChildren(false) || []) {
                    if (!child) continue;
                    descendants.push(child);
                    walk(child);
                }
            };
            walk(block);
        } catch (_) { }
        return descendants;
    }

    function isOuterSearchMatch(block, query) {
        if (!block || !query) return false;
        for (const child of getSearchDescendants(block)) {
            if (searchTextForBlock(child).includes(query)) return true;
        }
        return false;
    }

    function searchBlocks(seedText) {
        const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
        if (typeof seedText === "string" && blockSearchInput) {
            blockSearchInput.value = seedText;
        }
        const query = blockSearchInput ? String(blockSearchInput.value || "").trim().toLowerCase() : "";
        if (query && query === String(blockSearchInput && blockSearchInput.dataset.lastQuery || "") && blockSearchMatches.length) {
            searchNextBlock();
            return;
        }
        if (!ws || typeof ws.getAllBlocks !== "function" || !query) {
            blockSearchMatches = [];
            blockSearchIndex = 0;
            removeBlockSearchHighlight();
            if (blockSearchResult) blockSearchResult.textContent = "";
            return;
        }

        blockSearchMatches = ws.getAllBlocks(false).filter(block =>
            searchTextForBlock(block).includes(query) && !isOuterSearchMatch(block, query)
        );
        blockSearchIndex = 0;
        if (blockSearchInput) blockSearchInput.dataset.lastQuery = query;

        if (!blockSearchMatches.length) {
            removeBlockSearchHighlight();
            if (blockSearchResult) blockSearchResult.textContent =
                getPortalLanguage() === "ja" ? "見つかりません" : "Not found";
            return;
        }

        const target = blockSearchMatches[0];
        prepareSearchTarget(target);
        if (blockSearchResult) blockSearchResult.textContent =
            String(blockSearchIndex + 1) + " / " + String(blockSearchMatches.length);
    }

    function searchNextBlock() {
        if (!blockSearchMatches.length) {
            searchBlocks();
            return;
        }
        blockSearchIndex = (blockSearchIndex + 1) % blockSearchMatches.length;
        const target = blockSearchMatches[blockSearchIndex];
        prepareSearchTarget(target);
        if (blockSearchResult) blockSearchResult.textContent =
            String(blockSearchIndex + 1) + " / " + String(blockSearchMatches.length);
    }

    function makeBlockSearchPanelDraggable(panel, handle) {
        handle.addEventListener("pointerdown", event => {
            if (event.button !== 0) return;
            const rect = panel.getBoundingClientRect();
            blockSearchDragState = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top
            };
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener("pointermove", event => {
            if (!blockSearchDragState || blockSearchDragState.pointerId !== event.pointerId) return;
            const left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth,
                event.clientX - blockSearchDragState.offsetX));
            const top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight,
                event.clientY - blockSearchDragState.offsetY));
            panel.style.left = left + "px";
            panel.style.top = top + "px";
            panel.style.transform = "none";
        });
        const endDrag = event => {
            if (!blockSearchDragState || blockSearchDragState.pointerId !== event.pointerId) return;
            blockSearchDragState = null;
            try { handle.releasePointerCapture(event.pointerId); } catch (_) { }
        };
        handle.addEventListener("pointerup", endDrag);
        handle.addEventListener("pointercancel", endDrag);
    }

    function openBlockSearch(block) {
        createBlockSearchPanel();
        const seed = getBlockSearchSeed(block);
        if (blockSearchInput && seed) {
            blockSearchInput.value = seed;
            blockSearchInput.dataset.lastQuery = "";
            searchBlocks(seed);
        } else if (blockSearchInput) {
            blockSearchInput.focus();
            blockSearchInput.select();
        }
    }

    function createBlockSearchPanel() {
        if (blockSearchPanel) {
            blockSearchPanel.style.display = "flex";
            return;
        }
        const ja = getPortalLanguage() === "ja";
        const panel = document.createElement("div");
        panel.id = "bf6-block-search-panel";
        panel.style.cssText = [
            "position:fixed", "z-index:2147483645", "top:18px", "left:50%",
            "transform:translateX(-50%)", "display:flex", "flex-direction:column",
            "width:360px", "padding:0", "background:rgba(24,30,38,.97)",
            "border:1px solid #667381", "border-radius:7px",
            "box-shadow:0 5px 20px rgba(0,0,0,.45)", "color:#fff",
            "font-family:Arial,sans-serif", "user-select:none"
        ].join(";");

        const title = document.createElement("div");
        title.style.cssText = [
            "height:28px", "display:flex", "align-items:center", "padding:0 6px 0 10px",
            "background:#313b47", "border-radius:6px 6px 0 0", "font-size:13px",
            "font-weight:bold", "cursor:move"
        ].join(";");

        const titleText = document.createElement("span");
        titleText.textContent = ja ? "ブロック検索" : "Block Search";
        titleText.style.cssText = "flex:1;pointer-events:none;";

        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.textContent = "✕";
        closeButton.title = ja ? "閉じる" : "Close";
        closeButton.style.cssText = [
            "width:24px", "height:24px", "padding:0", "border:0", "border-radius:4px",
            "background:transparent", "color:#d7dee5", "font-size:16px", "line-height:24px",
            "cursor:pointer", "user-select:none"
        ].join(";");
        closeButton.addEventListener("pointerdown", event => event.stopPropagation());
        closeButton.addEventListener("click", event => {
            event.stopPropagation();
            panel.style.display = "none";
            removeBlockSearchHighlight();
        });
        title.appendChild(titleText);
        title.appendChild(closeButton);

        const body = document.createElement("div");
        body.style.cssText = "display:flex;align-items:center;gap:6px;padding:9px;";

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = ja ? "検索項目を入力" : "Search blocks";
        input.autocomplete = "off";
        input.style.cssText = [
            "flex:1", "min-width:0", "height:30px", "box-sizing:border-box",
            "padding:4px 8px", "border:1px solid #687785", "border-radius:4px",
            "background:#20262d", "color:#f2f5f7", "caret-color:#55dfff", "font-size:13px", "user-select:text", "outline:none"
        ].join(";");

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = ja ? "検索" : "Search";
        button.style.cssText = [
            "height:30px", "padding:0 12px", "border:1px solid #55dfff",
            "border-radius:4px", "background:#1c6475", "color:#fff",
            "font-size:13px", "cursor:pointer"
        ].join(";");

        const stopButton = document.createElement("button");
        stopButton.type = "button";
        stopButton.textContent = ja ? "中止" : "Stop";
        stopButton.title = ja ? "検索を中止" : "Stop search";
        stopButton.style.cssText = [
            "height:30px", "padding:0 10px", "border:1px solid #687785",
            "border-radius:4px", "background:#343b43", "color:#f2f5f7",
            "font-size:13px", "cursor:pointer"
        ].join(";");

        const result = document.createElement("span");
        result.style.cssText = "min-width:48px;text-align:right;font-size:11px;color:#9edfed;";

        button.addEventListener("click", searchBlocks);
        stopButton.addEventListener("click", event => {
            event.stopPropagation();
            removeBlockSearchHighlight();
            blockSearchMatches = [];
            blockSearchIndex = 0;
            if (blockSearchInput) blockSearchInput.dataset.lastQuery = "";
            if (blockSearchResult) blockSearchResult.textContent = "";
        });
        input.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;
            const query = String(input.value || "").trim().toLowerCase();
            if (blockSearchMatches.length && query === String(input.dataset.lastQuery || "")) {
                searchNextBlock();
            } else {
                searchBlocks();
            }
        });

        body.appendChild(input);
        body.appendChild(button);
        body.appendChild(stopButton);
        body.appendChild(result);
        panel.appendChild(title);
        panel.appendChild(body);
        document.body.appendChild(panel);
        makeBlockSearchPanelDraggable(panel, title);

        blockSearchPanel = panel;
        blockSearchInput = input;
        blockSearchResult = result;
    }

    function blockSearchText() {
        return getPortalLanguage() === "ja" ? "ブロック検索" : "Block Search";
    }

    // ===== マウスホイールによるスクロール処理 =====
    function handleWorkspaceWheel(event) {
        const isShift = event.shiftKey;
        const isCtrl = event.ctrlKey || event.metaKey;

        // ShiftまたはCtrlが押されていない通常操作は既定（拡大縮小）のまま通す
        if (!isShift && !isCtrl) return;

        // 検索パネルや入力欄の上ではスクロール処理を行わない
        if (event.target && typeof event.target.closest === "function") {
            if (event.target.closest("#bf6-block-search-panel") || event.target.closest("input, textarea, select")) {
                return;
            }
        }

        const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
        if (!ws) return;

        const injectionDiv = typeof ws.getInjectionDiv === "function" ? ws.getInjectionDiv() : null;
        if (injectionDiv && !injectionDiv.contains(event.target)) {
            return;
        }

        // デフォルトのズーム処理やブラウザ動作を停止
        event.preventDefault();
        event.stopPropagation();

        // 移動量の算出
        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 33;      // LINE単位
        else if (event.deltaMode === 2) delta *= 100; // PAGE単位

        let deltaX = 0;
        let deltaY = 0;

        if (isShift) {
            // Shift + ホイール: 左右スクロール
            const dx = event.deltaX !== 0 ? event.deltaX : delta;
            deltaX = -dx;
        } else if (isCtrl) {
            // Ctrl + ホイール: 上下スクロール
            deltaY = -delta;
        }

        const newX = (ws.scrollX || 0) + deltaX;
        const newY = (ws.scrollY || 0) + deltaY;

        if (typeof ws.scroll === "function") {
            try {
                ws.scroll(newX, newY);
                return;
            } catch (_) { }
        }

        if (typeof ws.translate === "function") {
            ws.scrollX = newX;
            ws.scrollY = newY;
            ws.translate(newX, newY);
        }

        try {
            if (ws.scrollbar) {
                if (typeof ws.scrollbar.set === "function") {
                    ws.scrollbar.set(newX, newY);
                } else if (typeof ws.scrollbar.resize === "function") {
                    ws.scrollbar.resize();
                }
            }
        } catch (_) { }
    }

    // ===== 全体縮小ミニマップ =====
    function getWorkspaceBounds(ws) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const blocks = ws.getTopBlocks ? ws.getTopBlocks(false) : [];
        if (!blocks.length) {
            return { minX: 0, minY: 0, maxX: 1000, maxY: 1000, width: 1000, height: 1000 };
        }
        for (const block of blocks) {
            const xy = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
            const hw = block.getHeightWidth ? block.getHeightWidth() : { width: 100, height: 50 };
            minX = Math.min(minX, xy.x);
            minY = Math.min(minY, xy.y);
            maxX = Math.max(maxX, xy.x + hw.width);
            maxY = Math.max(maxY, xy.y + hw.height);
        }
        return {
            minX, minY, maxX, maxY,
            width: Math.max(100, maxX - minX),
            height: Math.max(100, maxY - minY)
        };
    }

    function renderMinimap() {
        if (!minimapIsOpen || !minimapCanvas) return;
        const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
        if (!ws) return;

        const ctx = minimapCanvas.getContext("2d");
        const cw = minimapCanvas.width;
        const ch = minimapCanvas.height;
        ctx.clearRect(0, 0, cw, ch);

        const inj = ws.getInjectionDiv ? ws.getInjectionDiv() : document.body;
        const viewW = inj.clientWidth || 1000;
        const viewH = inj.clientHeight || 800;
        const scale = ws.scale || 1;

        // 現在の画面表示範囲 (ワークスペース座標)
        const curLeft = -ws.scrollX / scale;
        const curTop = -ws.scrollY / scale;
        const curRight = curLeft + (viewW / scale);
        const curBottom = curTop + (viewH / scale);

        // ブロック全体範囲と画面範囲を統合したマップの表示領域を決定
        const b = getWorkspaceBounds(ws);
        const pad = 200;
        const mapMinX = Math.min(b.minX, curLeft) - pad;
        const mapMinY = Math.min(b.minY, curTop) - pad;
        const mapMaxX = Math.max(b.maxX, curRight) + pad;
        const mapMaxY = Math.max(b.maxY, curBottom) + pad;
        const mapW = mapMaxX - mapMinX;
        const mapH = mapMaxY - mapMinY;

        // 縮小率 (アスペクト比維持)
        const zoom = Math.min(cw / mapW, ch / mapH);
        const offX = (cw - mapW * zoom) / 2;
        const offY = (ch - mapH * zoom) / 2;

        const toMapX = (x) => offX + (x - mapMinX) * zoom;
        const toMapY = (y) => offY + (y - mapMinY) * zoom;

        // キャッシュ（クリック判定用）
        minimapCanvas._mapData = { mapMinX, mapMinY, zoom, offX, offY, viewW, viewH, scale };

        // 1. 各ブロックの簡易描画
        ctx.fillStyle = "rgba(85, 223, 255, 0.45)";
        for (const block of ws.getTopBlocks ? ws.getTopBlocks(false) : []) {
            const xy = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
            const hw = block.getHeightWidth ? block.getHeightWidth() : { width: 80, height: 40 };
            ctx.fillRect(toMapX(xy.x), toMapY(xy.y), Math.max(3, hw.width * zoom), Math.max(3, hw.height * zoom));
        }

        // 2. 現在の画面表示枠 (ビューポート) の描画
        const vx = toMapX(curLeft);
        const vy = toMapY(curTop);
        const vw = (viewW / scale) * zoom;
        const vh = (viewH / scale) * zoom;

        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillRect(vx, vy, vw, vh);
        ctx.strokeStyle = "#55dfff";
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);
    }

    function moveWorkspaceToMapPos(mx, my) {
        const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
        const data = minimapCanvas && minimapCanvas._mapData;
        if (!ws || !data) return;

        // ミニマップ座標からワークスペース中心座標へ変換
        const wsX = data.mapMinX + (mx - data.offX) / data.zoom;
        const wsY = data.mapMinY + (my - data.offY) / data.zoom;

        const targetScrollX = -(wsX * data.scale) + (data.viewW / 2);
        const targetScrollY = -(wsY * data.scale) + (data.viewH / 2);

        if (typeof ws.scroll === "function") {
            try { ws.scroll(targetScrollX, targetScrollY); } catch (_) { }
        }
        if (typeof ws.translate === "function") {
            ws.scrollX = targetScrollX;
            ws.scrollY = targetScrollY;
            ws.translate(targetScrollX, targetScrollY);
        }
        if (ws.scrollbar && typeof ws.scrollbar.resize === "function") {
            try { ws.scrollbar.resize(); } catch (_) { }
        }
        renderMinimap();
    }

    function createMinimapPanel() {
        if (minimapPanel) return;
        const ja = getPortalLanguage() === "ja";

        const panel = document.createElement("div");
        panel.id = "bf6-minimap-panel";
        panel.style.cssText = [
            "position:fixed", "z-index:2147483640", "top:60px", "right:20px",
            "width:520px", "background:rgba(20,26,34,.96)", "border:1px solid #667381",
            "border-radius:6px", "box-shadow:0 8px 30px rgba(0,0,0,.6)", "display:none",
            "flex-direction:column", "user-select:none", "overflow:hidden"
        ].join(";");

        const header = document.createElement("div");
        header.style.cssText = "height:28px;background:#2b3440;display:flex;align-items:center;padding:0 10px;font-size:13px;font-weight:bold;color:#fff;";
        header.textContent = ja ? "全体マップ (移動)" : "Minimap (Navigate)";

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        closeBtn.style.cssText = "margin-left:auto;background:transparent;border:0;color:#aaa;cursor:pointer;font-size:16px;line-height:28px;padding:0 4px;";
        closeBtn.onclick = () => toggleMinimap(false);
        header.appendChild(closeBtn);

        // 描画キャンバス（幅・高さを2倍に設定）
        const canvas = document.createElement("canvas");
        canvas.width = 518;
        canvas.height = 360;
        canvas.style.cssText = "background:#12161c;cursor:crosshair;display:block;width:518px;height:360px;";

        let isDragging = false;
        const handlePointer = (e) => {
            const rect = canvas.getBoundingClientRect();
            moveWorkspaceToMapPos(e.clientX - rect.left, e.clientY - rect.top);
        };
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            canvas.setPointerCapture(e.pointerId);
            handlePointer(e);
        });
        canvas.addEventListener("pointermove", (e) => { if (isDragging) handlePointer(e); });
        const stopDrag = (e) => {
            isDragging = false;
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
        };
        canvas.addEventListener("pointerup", stopDrag);
        canvas.addEventListener("pointercancel", stopDrag);

        panel.appendChild(header);
        panel.appendChild(canvas);
        document.body.appendChild(panel);

        minimapPanel = panel;
        minimapCanvas = canvas;
    }

    function toggleMinimap(force) {
        createMinimapPanel();
        minimapIsOpen = typeof force === "boolean" ? force : !minimapIsOpen;
        minimapPanel.style.display = minimapIsOpen ? "flex" : "none";
        if (minimapButton) {
            minimapButton.style.borderColor = minimapIsOpen ? "#55dfff" : "#667381";
            minimapButton.style.color = minimapIsOpen ? "#55dfff" : "#fff";
        }
        if (minimapIsOpen) {
            const loop = () => {
                renderMinimap();
                if (minimapIsOpen) minimapAnimId = requestAnimationFrame(loop);
            };
            loop();
        } else if (minimapAnimId) {
            cancelAnimationFrame(minimapAnimId);
        }
    }

    // 右上ツールバーへのアイコン配置（検索バーの幅伸縮を考慮し、Flex親要素の先頭に挿入）
    function initMinimapButton() {
        if (minimapButton && document.body.contains(minimapButton)) return;

        // 1. アイコンボタンの生成
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "bf6-minimap-toggle-btn";
        btn.title = getPortalLanguage() === "ja" ? "全体マップ表示/移動" : "Toggle Minimap";
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>`;
        btn.style.cssText = [
            "position:fixed", "z-index:100", "height:30px", "width:32px", "padding:0",
            "display:inline-flex", "align-items:center", "justify-content:center",
            "background:#20262d", "border:1px solid #667381", "border-radius:4px",
            "color:#fff", "cursor:pointer", "box-shadow:0 2px 6px rgba(0,0,0,.35)"
        ].join(";");

        btn.onclick = (e) => {
            e.stopPropagation();
            toggleMinimap();
        };

        // 2. ブロック置き場（キャンバス）の枠を基準に、高さはそのまま「左端」へ配置
        const updatePosition = () => {
            const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
            const svgRoot = (ws && typeof ws.getParentSvg === "function" && ws.getParentSvg()) || document.querySelector('.blocklySvg');
            if (!svgRoot) return;
            const svgRect = svgRoot.getBoundingClientRect();
            // 高さ: 右上アイコン群と同じ(枠の上端+12px) / 横位置: ブロックリストパネルの右隣(枠の左端+16px)
            btn.style.top = (svgRect.top + 12) + "px";
            btn.style.left = (svgRect.left + 16) + "px";
        };

        document.body.appendChild(btn);
        minimapButton = btn;

        // 初期配置＆画面リサイズ時の自動追従
        updatePosition();
        window.addEventListener("resize", updatePosition);
    }

    function initScrollWheel() {
        if (wheelListenerAttached) return;
        // キャプチャフェーズで登録してBlocklyの既定ホイール処理より先に割り込む
        window.addEventListener("wheel", handleWorkspaceWheel, { passive: false, capture: true });
        wheelListenerAttached = true;
    }

    function registerMenus() {
        if (menusRegistered) return;
        const Scope = _Blockly.ContextMenuRegistry.ScopeType;

        const subroutineItem = {
            id: "blockUtilityGoToSubroutine",
            displayText: () => subroutineText("target"),
            scopeType: Scope.BLOCK,
            weight: 89,
            preconditionFn: scope => scope && scope.block &&
                scope.block.type === "subroutineInstanceBlock" &&
                getSubroutineInstanceName(scope.block) ? "enabled" : "hidden",
            callback: scope => {
                if (scope && scope.block) goToSubroutineBlock(scope.block);
            }
        };
        plugin.registerItem(subroutineItem);
        _Blockly.ContextMenuRegistry.registry.register(subroutineItem);

        const sourceItem = {
            id: "blockUtilityGoToSubroutineSource",
            displayText: () => subroutineText("source"),
            scopeType: Scope.BLOCK,
            weight: 88,
            preconditionFn: scope => scope && scope.block &&
                scope.block.type === "subroutineBlock" &&
                getSubroutineBlockName(scope.block) ? "enabled" : "hidden",
            callback: scope => {
                if (scope && scope.block) goToSubroutineSource(scope.block);
            }
        };
        plugin.registerItem(sourceItem);
        _Blockly.ContextMenuRegistry.registry.register(sourceItem);

        const blockSearchItem = {
            id: "blockUtilityBlockSearch",
            displayText: () => blockSearchText(),
            scopeType: Scope.BLOCK,
            weight: 86,
            preconditionFn: scope => scope && scope.block ? "enabled" : "hidden",
            callback: scope => {
                openBlockSearch(scope && scope.block ? scope.block : null);
            }
        };
        plugin.registerItem(blockSearchItem);
        _Blockly.ContextMenuRegistry.registry.register(blockSearchItem);

        const workspaceBlockSearchItem = {
            id: "blockUtilityBlockSearchWorkspace",
            displayText: () => blockSearchText(),
            scopeType: Scope.WORKSPACE,
            weight: 86,
            preconditionFn: () => "enabled",
            callback: () => {
                openBlockSearch(null);
            }
        };
        plugin.registerItem(workspaceBlockSearchItem);
        _Blockly.ContextMenuRegistry.registry.register(workspaceBlockSearchItem);

        const ruleNumberItem = {
            id: "blockUtilityAddRuleNumbers",
            displayText: () => ruleNumberText(),
            scopeType: Scope.BLOCK,
            weight: 87,
            preconditionFn: scope => scope && scope.block &&
                scope.block.type === "modBlock" ? "enabled" : "hidden",
            callback: scope => {
                if (scope && scope.block) renumberRulesInMod(scope.block);
            }
        };
        plugin.registerItem(ruleNumberItem);
        _Blockly.ContextMenuRegistry.registry.register(ruleNumberItem);

        menusRegistered = true;
    }

    plugin.initializeWorkspace = async function () {
        try {
            registerMenus();
            initScrollWheel();
            initMinimapButton(); // ← ここを追加
        } catch (e) {
            if (BF2042Portal.Shared && typeof BF2042Portal.Shared.logError === "function") {
                BF2042Portal.Shared.logError("BlockUtility initialization", String(e));
            }
        }
    };
})();
