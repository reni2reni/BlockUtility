/* global BF2042Portal, _Blockly */
(function () {
    "use strict";

    // BlockUtility: BF2042 Portal 用の独立ユーティリティプラグイン
    const plugin = BF2042Portal.Plugins.getPlugin("BlockUtility");
    let menusRegistered = false;
    let wheelListenerAttached = false;
    // ===== ミニマップ関連変数 =====
    let minimapButton = null;

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
    let minimapPanel = null;
    let minimapCanvas = null;
    let minimapInfoBar = null;
    let minimapIsOpen = false;
    let minimapIsCollapsed = false;
    let minimapAnimId = null;
    let minimapDragState = null;
    let minimapZoom = 1; // 1.0 〜 4.0（ホイールで無段階変更）
    let minimapFocusAnchor = null;
    let minimapAutoScrollId = null;
    let minimapEdgeDir = { x: 0, y: 0 };

    function getRuleChildWidths(block) {
        const widths = [];
        if (!block) return widths;

        const addBlockWidth = (child) => {
            if (!child || child === block) return;
            let w = 0;
            try {
                const root = typeof child.getSvgRoot === "function" ? child.getSvgRoot() : null;
                const pathEl = root && root.querySelector ? root.querySelector(":scope > path.blocklyPath") : null;
                if (pathEl && typeof pathEl.getBBox === "function") {
                    const bbox = pathEl.getBBox();
                    if (bbox && Number.isFinite(bbox.width) && bbox.width > 0) {
                        w = bbox.width;
                    }
                }
            } catch (_) { }

            if (!w && typeof child.getHeightWidth === "function") {
                try {
                    const hw = child.getHeightWidth();
                    if (hw && Number.isFinite(hw.width) && hw.width > 0) {
                        w = hw.width;
                    }
                } catch (_) { }
            }

            if (w > 0) widths.push(w);
        };

        try {
            if (typeof block.getDescendants === "function") {
                for (const desc of block.getDescendants(false) || []) {
                    addBlockWidth(desc);
                }
                return widths;
            }
        } catch (_) { }

        const walk = (current) => {
            if (!current || typeof current.getChildren !== "function") return;
            for (const child of current.getChildren(false) || []) {
                if (!child) continue;
                addBlockWidth(child);
                walk(child);
            }
        };
        walk(block);
        return widths;
    }

    function getRuleIndividualWidth(block, fallbackWidth) {
        const childWidths = getRuleChildWidths(block);
        let baseWidth;

        if (childWidths.length > 0) {
            baseWidth = Math.max(...childWidths); // 子ブロック横幅の最大値
        } else {
            baseWidth = fallbackWidth > 0 ? fallbackWidth : 120;
        }

        const singleWidth = Math.max(40, Math.round(baseWidth));
        return singleWidth; // 倍率1x
    }

    function getRuleMapBounds(block) {
        const xy = block && typeof block.getRelativeToSurfaceXY === "function"
            ? block.getRelativeToSurfaceXY()
            : { x: 0, y: 0 };

        let width = 80;
        let height = 40;

        try {
            const root = block && typeof block.getSvgRoot === "function" ? block.getSvgRoot() : null;
            const pathEl = root && root.querySelector ? root.querySelector(":scope > path.blocklyPath") : null;
            if (pathEl && typeof pathEl.getBBox === "function") {
                const bbox = pathEl.getBBox();
                if (bbox && bbox.width > 0) width = bbox.width;
                if (bbox && bbox.height > 0) height = bbox.height;
            }
        } catch (_) { }

        if (width === 80 && block && typeof block.getHeightWidth === "function") {
            try {
                const hw = block.getHeightWidth();
                if (hw && hw.width > 0) width = hw.width;
                if (hw && hw.height > 0) height = hw.height;
            } catch (_) { }
        }

        return {
            x: Number(xy.x) || 0,
            y: Number(xy.y) || 0,
            width: getRuleIndividualWidth(block, width),
            height
        };
    }
    
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

    function stopMinimapEdgeAutoScroll() {
        if (minimapAutoScrollId) {
            cancelAnimationFrame(minimapAutoScrollId);
            minimapAutoScrollId = null;
        }
        minimapEdgeDir.x = 0;
        minimapEdgeDir.y = 0;
    }

    function updateMinimapEdgeAutoScroll(mx, my) {
        if (!minimapCanvas) return;

        const edgeZone = 32;
        const cw = minimapCanvas.width;
        const ch = minimapCanvas.height;

        let dx = 0;
        let dy = 0;
        if (mx >= 0 && mx < edgeZone) {
            const ratio = (edgeZone - mx) / edgeZone;
            dx = -(ratio * ratio);
        } else if (mx > cw - edgeZone && mx <= cw) {
            const ratio = (mx - (cw - edgeZone)) / edgeZone;
            dx = ratio * ratio;
        }

        if (my >= 0 && my < edgeZone) {
            const ratio = (edgeZone - my) / edgeZone;
            dy = -(ratio * ratio);
        } else if (my > ch - edgeZone && my <= ch) {
            const ratio = (my - (ch - edgeZone)) / edgeZone;
            dy = ratio * ratio;
        }

        minimapEdgeDir.x = dx;
        minimapEdgeDir.y = dy;

        if ((dx !== 0 || dy !== 0) && !minimapAutoScrollId) {
            const step = () => {
                if (!minimapIsOpen || minimapIsCollapsed) {
                    stopMinimapEdgeAutoScroll();
                    return;
                }
                const data = minimapCanvas && minimapCanvas._mapData;
                if (!data || (!minimapEdgeDir.x && !minimapEdgeDir.y)) {
                    stopMinimapEdgeAutoScroll();
                    return;
                }

                if (!minimapFocusAnchor) {
                    const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
                    const scale = (ws && ws.scale) || 1;
                    const curLeft = -((ws && ws.scrollX) || 0) / scale;
                    const curTop = -((ws && ws.scrollY) || 0) / scale;
                    minimapFocusAnchor = {
                        x: curLeft + (data.viewW / scale) / 2,
                        y: curTop + (data.viewH / scale) / 2
                    };
                }

                const speed = 7.0;
                minimapFocusAnchor.x += (minimapEdgeDir.x * speed) / data.zoom;
                minimapFocusAnchor.y += (minimapEdgeDir.y * speed) / data.zoom;

                renderMinimap();
                minimapAutoScrollId = requestAnimationFrame(step);
            };
            minimapAutoScrollId = requestAnimationFrame(step);
        } else if (dx === 0 && dy === 0) {
            stopMinimapEdgeAutoScroll();
        }
    }

    function renderMinimap() {
        if (!minimapIsOpen || minimapIsCollapsed || !minimapCanvas) return;
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

        const curLeft = -ws.scrollX / scale;
        const curTop = -ws.scrollY / scale;
        const curRight = curLeft + (viewW / scale);
        const curBottom = curTop + (viewH / scale);

        const b = getWorkspaceBounds(ws);
        const pad = 200;
        const mapMinX = Math.min(b.minX, curLeft) - pad;
        const mapMinY = Math.min(b.minY, curTop) - pad;
        const mapMaxX = Math.max(b.maxX, curRight) + pad;
        const mapMaxY = Math.max(b.maxY, curBottom) + pad;
        const mapW = mapMaxX - mapMinX;
        const mapH = mapMaxY - mapMinY;

        const mult = minimapZoom;
        const baseZoom = Math.min(cw / mapW, ch / mapH);
        const zoom = baseZoom * mult;

        let offX, offY;
        if (minimapFocusAnchor) {
            offX = (cw / 2) - (minimapFocusAnchor.x - mapMinX) * zoom;
            offY = (ch / 2) - (minimapFocusAnchor.y - mapMinY) * zoom;
        } else {
            offX = (cw - mapW * zoom) / 2;
            offY = (ch - mapH * zoom) / 2;
        }

        const toMapX = (x) => offX + (x - mapMinX) * zoom;
        const toMapY = (y) => offY + (y - mapMinY) * zoom;

        minimapCanvas._mapData = { mapMinX, mapMinY, zoom, offX, offY, viewW, viewH, scale };

        const allBlocks = ws.getAllBlocks ? ws.getAllBlocks(false) : [];
        const topBlocks = ws.getTopBlocks ? ws.getTopBlocks(false) : [];

        // 1. MODブロック等の外枠ベース
        ctx.fillStyle = "rgba(42, 54, 68, 0.45)";
        ctx.strokeStyle = "rgba(68, 85, 105, 0.6)";
        ctx.lineWidth = 1;
        for (const block of topBlocks) {
            if (block.type === "subroutineBlock" || block.type === "ruleBlock") continue;
            const xy = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
            const hw = block.getHeightWidth ? block.getHeightWidth() : { width: 80, height: 40 };
            const bx = toMapX(xy.x);
            const by = toMapY(xy.y);
            const bw = Math.max(4, hw.width * zoom);
            const bh = Math.max(4, hw.height * zoom);
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh);
        }

        // 2. ルールブロック（赤紫＋境目／個別横幅4倍）
        for (const block of allBlocks) {
            if (block.type !== "ruleBlock") continue;
            const bnd = getRuleMapBounds(block);
            const bx = toMapX(bnd.x);
            const by = toMapY(bnd.y);
            const bw = Math.max(4, bnd.width * zoom);
            const bh = Math.max(4, bnd.height * zoom);

            ctx.fillStyle = "rgba(168, 43, 107, 0.75)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = "rgba(255, 115, 185, 0.95)";
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + 0.5, by + 0.5, Math.max(1, bw - 1), Math.max(1, bh - 1));
        }

        // 3. サブルーチンブロック（茶色＋枠線／元の表示）
        for (const block of allBlocks) {
            if (block.type !== "subroutineBlock") continue;
            const xy = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
            const hw = block.getHeightWidth ? block.getHeightWidth() : { width: 80, height: 40 };
            const bx = toMapX(xy.x);
            const by = toMapY(xy.y);
            const bw = Math.max(4, hw.width * zoom);
            const bh = Math.max(4, hw.height * zoom);

            ctx.fillStyle = "rgba(145, 78, 32, 0.85)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeStyle = "rgba(225, 155, 95, 0.95)";
            ctx.lineWidth = 1;
            ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        }

        // 4. 現在の画面表示枠 (ビューポート)
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

    // マウスホバー位置のブロック名を取得して情報枠へ表示
    function updateHoveredBlockInfo(mx, my) {
        if (!minimapInfoBar) return;
        const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
        const data = minimapCanvas && minimapCanvas._mapData;
        if (!ws || !data) {
            minimapInfoBar.textContent = "---";
            return;
        }

        const wsX = data.mapMinX + (mx - data.offX) / data.zoom;
        const wsY = data.mapMinY + (my - data.offY) / data.zoom;

        const allBlocks = ws.getAllBlocks ? ws.getAllBlocks(false) : [];
        let found = null;
        let bestArea = Infinity;

        for (const block of allBlocks) {
            if (block.type !== "ruleBlock" && block.type !== "subroutineBlock") continue;
            const xy = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
            const hw = block.getHeightWidth ? block.getHeightWidth() : { width: 80, height: 40 };
            const left = xy.x;
            const top = xy.y;
            const right = xy.x + hw.width;
            const bottom = xy.y + hw.height;

            if (wsX >= left && wsX <= right && wsY >= top && wsY <= bottom) {
                const area = Math.max(1, hw.width) * Math.max(1, hw.height);
                if (area < bestArea) {
                    bestArea = area;
                    found = block;
                }
            }
        }

        const ja = getPortalLanguage() === "ja";
        if (found) {
            if (found.type === "ruleBlock") {
                const name = getRuleBlockName(found) || (ja ? "(無名のルール)" : "(Unnamed Rule)");
                minimapInfoBar.textContent = `${ja ? "[ルール] " : "[Rule] "} ${name}`;
                minimapInfoBar.style.color = "#ff85c8";
            } else {
                const name = getSubroutineBlockName(found) || (ja ? "(無名のサブルーチン)" : "(Unnamed Subroutine)");
                minimapInfoBar.textContent = `${ja ? "[サブルーチン] " : "[Subroutine] "} ${name}`;
                minimapInfoBar.style.color = "#f0a66d";
            }
        } else {
            minimapInfoBar.textContent = "---";
            minimapInfoBar.style.color = "#7b8b98";
        }
    }

    function findBlockAtWorkspacePos(ws, wsX, wsY) {
        const allBlocks = ws && ws.getAllBlocks ? ws.getAllBlocks(false) : [];
        let found = null;
        let bestArea = Infinity;

        for (const block of allBlocks) {
            if (block.type !== "ruleBlock" && block.type !== "subroutineBlock") continue;

            let left, top, width, height;
            if (block.type === "ruleBlock") {
                const bnd = getRuleMapBounds(block);
                left = bnd.x;
                top = bnd.y;
                width = bnd.width;
                height = bnd.height;
            } else {
                const xy = block.getRelativeToSurfaceXY ? block.getRelativeToSurfaceXY() : { x: 0, y: 0 };
                const hw = block.getHeightWidth ? block.getHeightWidth() : { width: 80, height: 40 };
                left = xy.x;
                top = xy.y;
                width = hw.width;
                height = hw.height;
            }

            if (wsX >= left && wsX <= left + width && wsY >= top && wsY <= top + height) {
                const area = Math.max(1, width) * Math.max(1, height);
                if (area < bestArea) {
                    bestArea = area;
                    found = block;
                }
            }
        }
        return found;
    }

    function moveWorkspaceToMapPos(mx, my, snapToBlockTopLeft = false) {
        const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
        const data = minimapCanvas && minimapCanvas._mapData;
        if (!ws || !data) return;

        let wsX = data.mapMinX + (mx - data.offX) / data.zoom;
        let wsY = data.mapMinY + (my - data.offY) / data.zoom;

        let targetScrollX;
        let targetScrollY;

        if (snapToBlockTopLeft) {
            const targetBlock = findBlockAtWorkspacePos(ws, wsX, wsY);
            if (targetBlock && typeof targetBlock.getRelativeToSurfaceXY === "function") {
                const xy = targetBlock.getRelativeToSurfaceXY();
                // ビューポート枠の左上 (curLeft = -scrollX / scale) がブロック左上 (xy.x, xy.y) に重なる位置
                targetScrollX = -(xy.x * data.scale);
                targetScrollY = -(xy.y * data.scale);
            } else {
                targetScrollX = -(wsX * data.scale) + (data.viewW / 2);
                targetScrollY = -(wsY * data.scale) + (data.viewH / 2);
            }
        } else {
            targetScrollX = -(wsX * data.scale) + (data.viewW / 2);
            targetScrollY = -(wsY * data.scale) + (data.viewH / 2);
        }

        ws.scrollX = targetScrollX;
        ws.scrollY = targetScrollY;

        if (typeof ws.translate === "function") {
            ws.translate(targetScrollX, targetScrollY);
        }
        if (typeof ws.scroll === "function") {
            try { ws.scroll(targetScrollX, targetScrollY); } catch (_) { }
        }
        renderMinimap();
    }

    function makeMinimapPanelDraggable(panel, handle) {
        handle.addEventListener("pointerdown", event => {
            if (event.button !== 0 || event.target.tagName === "BUTTON") return;
            const rect = panel.getBoundingClientRect();
            minimapDragState = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
                startX: event.clientX,
                startY: event.clientY,
                hasMoved: false
            };
            handle.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener("pointermove", event => {
            if (!minimapDragState || minimapDragState.pointerId !== event.pointerId) return;

            const dx = Math.abs(event.clientX - minimapDragState.startX);
            const dy = Math.abs(event.clientY - minimapDragState.startY);
            if (dx > 4 || dy > 4) {
                minimapDragState.hasMoved = true;
            }

            if (!minimapDragState.hasMoved) return;

            const left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth,
                event.clientX - minimapDragState.offsetX));
            const top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight,
                event.clientY - minimapDragState.offsetY));
            panel.style.left = left + "px";
            panel.style.top = top + "px";
            panel.style.right = "auto";
        });

        const endDrag = event => {
            if (!minimapDragState || minimapDragState.pointerId !== event.pointerId) return;
            const hasMoved = minimapDragState.hasMoved;
            minimapDragState = null;
            try { handle.releasePointerCapture(event.pointerId); } catch (_) { }

            if (!hasMoved) {
                toggleMinimapCollapse();
            }
        };

        handle.addEventListener("pointerup", endDrag);
        handle.addEventListener("pointercancel", endDrag);
    }

    function toggleMinimapCollapse() {
        if (!minimapPanel || !minimapCanvas) return;
        minimapIsCollapsed = !minimapIsCollapsed;

        if (minimapIsCollapsed) {
            minimapCanvas.style.display = "none";
            if (minimapInfoBar) minimapInfoBar.style.display = "none";
            stopMinimapLoop();
        } else {
            minimapCanvas.style.display = "block";
            if (minimapInfoBar) minimapInfoBar.style.display = "flex";
            startMinimapLoop();
        }
    }

    function startMinimapLoop() {
        stopMinimapLoop();
        if (!minimapIsOpen || minimapIsCollapsed) return;
        const loop = () => {
            renderMinimap();
            if (minimapIsOpen && !minimapIsCollapsed) {
                minimapAnimId = requestAnimationFrame(loop);
            }
        };
        loop();
    }

    function stopMinimapLoop() {
        stopMinimapEdgeAutoScroll();
        if (minimapAnimId) {
            cancelAnimationFrame(minimapAnimId);
            minimapAnimId = null;
        }
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
        header.style.cssText = [
            "height:28px", "background:#2b3440", "display:flex", "align-items:center",
            "padding:0 8px 0 10px", "font-size:13px", "font-weight:bold", "color:#fff",
            "cursor:move"
        ].join(";");
        header.title = ja ? "ドラッグで移動 / クリックで折りたたみ・展開" : "Drag to move / Click to collapse or expand";

        const titleText = document.createElement("span");
        titleText.textContent = ja ? "全体マップ (移動)" : "Navigate with Minimap";
        titleText.style.cssText = "flex:1;pointer-events:none;";
        header.appendChild(titleText);

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        closeBtn.title = ja ? "完全に閉じる" : "Close";
        closeBtn.style.cssText = "background:transparent;border:0;color:#aaa;cursor:pointer;font-size:16px;line-height:28px;padding:0 4px;";
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            toggleMinimap(false);
        };
        header.appendChild(closeBtn);

        makeMinimapPanelDraggable(panel, header);

        const infoBar = document.createElement("div");
        infoBar.style.cssText = [
            "height:44px", "background:#171d24", "border-top:1px solid #333d4b",
            "border-bottom:1px solid #333d4b", "display:flex", "align-items:center",
            "padding:0 10px", "font-size:22px", "font-weight:bold", "color:#7b8b98",
            "white-space:nowrap", "overflow:hidden", "text-overflow:ellipsis"
        ].join(";");
        infoBar.textContent = "---";
        minimapInfoBar = infoBar;

        const canvas = document.createElement("canvas");
        canvas.width = 518;
        canvas.height = 360;
        canvas.style.cssText = "background:#12161c;cursor:crosshair;display:block;width:518px;height:360px;";

        let isDragging = false;
        const handlePointer = (e, snapToBlockTopLeft = false) => {
            const rect = canvas.getBoundingClientRect();
            moveWorkspaceToMapPos(e.clientX - rect.left, e.clientY - rect.top, snapToBlockTopLeft);
        };
        let dragState = null;
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const data = canvas._mapData;
            const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();

            let anchorX = minimapFocusAnchor ? minimapFocusAnchor.x : null;
            let anchorY = minimapFocusAnchor ? minimapFocusAnchor.y : null;

            if ((anchorX == null || anchorY == null) && data && ws) {
                const scale = ws.scale || 1;
                const curLeft = -(ws.scrollX || 0) / scale;
                const curTop = -(ws.scrollY || 0) / scale;
                anchorX = curLeft + (data.viewW / scale) / 2;
                anchorY = curTop + (data.viewH / scale) / 2;
            }

            dragState = {
                pointerId: e.pointerId,
                startX: mx,
                startY: my,
                lastX: mx,
                lastY: my,
                startAnchorX: anchorX,
                startAnchorY: anchorY,
                hasPanned: false
            };
            canvas.setPointerCapture(e.pointerId);
        });

        canvas.addEventListener("pointermove", (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            if (dragState && dragState.pointerId === e.pointerId) {
                const totalDx = mx - dragState.startX;
                const totalDy = my - dragState.startY;
                if (!dragState.hasPanned && Math.hypot(totalDx, totalDy) > 4) {
                    dragState.hasPanned = true;
                }

                if (dragState.hasPanned) {
                    const data = canvas._mapData;
                    if (data && dragState.startAnchorX != null && dragState.startAnchorY != null) {
                        minimapFocusAnchor = {
                            x: dragState.startAnchorX - totalDx / data.zoom,
                            y: dragState.startAnchorY - totalDy / data.zoom
                        };
                        renderMinimap();
                    }
                    updateMinimapEdgeAutoScroll(mx, my);
                }
            } else {
                stopMinimapEdgeAutoScroll();
            }

            updateHoveredBlockInfo(mx, my);
        });

        canvas.addEventListener("pointerleave", () => {
            if (minimapInfoBar) {
                minimapInfoBar.textContent = "---";
                minimapInfoBar.style.color = "#7b8b98";
            }
        });

        const stopDrag = (e) => {
            stopMinimapEdgeAutoScroll();
            if (dragState && dragState.pointerId === e.pointerId) {
                const wasClick = !dragState.hasPanned;
                const clickX = dragState.startX;
                const clickY = dragState.startY;
                dragState = null;
                try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }

                if (wasClick) {
                    moveWorkspaceToMapPos(clickX, clickY, true);
                }
            }
        };

        canvas.addEventListener("pointerup", stopDrag);
        canvas.addEventListener("pointercancel", stopDrag);

        canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const data = canvas._mapData;

            const focusWsX = data ? data.mapMinX + (mx - data.offX) / data.zoom : null;
            const focusWsY = data ? data.mapMinY + (my - data.offY) / data.zoom : null;

            const stepFactor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            minimapZoom = Math.max(1, Math.min(4, minimapZoom * stepFactor));

            if (minimapZoom <= 1.001) {
                minimapZoom = 1;
                minimapFocusAnchor = null;
            } else if (focusWsX != null && focusWsY != null && data) {
                const cw = canvas.width;
                const ch = canvas.height;
                const ws = _Blockly.getMainWorkspace && _Blockly.getMainWorkspace();
                const inj = ws && ws.getInjectionDiv ? ws.getInjectionDiv() : document.body;
                const viewW = inj ? (inj.clientWidth || 1000) : 1000;
                const viewH = inj ? (inj.clientHeight || 800) : 800;
                const b = ws ? getWorkspaceBounds(ws) : { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
                const scale = (ws && ws.scale) || 1;
                const curLeft = -((ws && ws.scrollX) || 0) / scale;
                const curTop = -((ws && ws.scrollY) || 0) / scale;
                const pad = 200;
                const mapMinX = Math.min(b.minX, curLeft) - pad;
                const mapMinY = Math.min(b.minY, curTop) - pad;
                const mapMaxX = Math.max(b.maxX, curLeft + viewW / scale) + pad;
                const mapMaxY = Math.max(b.maxY, curTop + viewH / scale) + pad;
                const baseZoom = Math.min(cw / (mapMaxX - mapMinX), ch / (mapMaxY - mapMinY));
                const nextZoom = baseZoom * minimapZoom;

                minimapFocusAnchor = {
                    x: focusWsX - (mx - cw / 2) / nextZoom,
                    y: focusWsY - (my - ch / 2) / nextZoom
                };
            }

            renderMinimap();
            updateHoveredBlockInfo(mx, my);
        }, { passive: false });

        panel.appendChild(header);
        panel.appendChild(infoBar);
        panel.appendChild(canvas);
        document.body.appendChild(panel);

        minimapPanel = panel;
        minimapCanvas = canvas;
    }

    function toggleMinimap(force) {
        createMinimapPanel();
        minimapIsOpen = typeof force === "boolean" ? force : !minimapIsOpen;
        minimapPanel.style.display = minimapIsOpen ? "flex" : "none";

        if (minimapIsOpen) {
            if (minimapIsCollapsed) {
                minimapIsCollapsed = false;
                if (minimapCanvas) minimapCanvas.style.display = "block";
                if (minimapInfoBar) minimapInfoBar.style.display = "flex";
            }
            startMinimapLoop();
        } else {
            stopMinimapLoop();
        }
    }

    function initScrollWheel() {
        if (wheelListenerAttached) return;
        // キャプチャフェーズで登録してBlocklyの既定ホイール処理より先に割り込む
        window.addEventListener("wheel", handleWorkspaceWheel, { passive: false, capture: true });
        wheelListenerAttached = true;
    }

    function minimapMenuText() {
        return getPortalLanguage() === "ja" ? "全体マップで移動" : "Navigate with Minimap";
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

        // Blocklyは右クリックした対象によって context menu の scope が変わるため、
        // BLOCK と WORKSPACE の両方に同じ「ブロック検索」を登録する。
        // BLOCK 側では、右クリックしたブロックのテキストをそのまま検索する。
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

        // ブロック以外のワークスペース上でも表示する。
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

        const minimapWorkspaceItem = {
            id: "blockUtilityMinimapWorkspace",
            displayText: () => minimapMenuText(),
            scopeType: Scope.WORKSPACE,
            weight: 85,
            preconditionFn: () => "enabled",
            callback: () => {
                toggleMinimap(true);
            }
        };
        plugin.registerItem(minimapWorkspaceItem);
        _Blockly.ContextMenuRegistry.registry.register(minimapWorkspaceItem);

        const minimapBlockItem = {
            id: "blockUtilityMinimapBlock",
            displayText: () => minimapMenuText(),
            scopeType: Scope.BLOCK,
            weight: 85,
            preconditionFn: scope => scope && scope.block ? "enabled" : "hidden",
            callback: () => {
                toggleMinimap(true);
            }
        };
        plugin.registerItem(minimapBlockItem);
        _Blockly.ContextMenuRegistry.registry.register(minimapBlockItem);

        menusRegistered = true;
    }

    plugin.initializeWorkspace = async function () {
        try {
            registerMenus();
            initScrollWheel();
        } catch (e) {
            if (BF2042Portal.Shared && typeof BF2042Portal.Shared.logError === "function") {
                BF2042Portal.Shared.logError("BlockUtility initialization", String(e));
            }
        }
    };
})();
