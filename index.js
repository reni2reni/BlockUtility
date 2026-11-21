/* global BF2042Portal, _Blockly */
(function () {
    "use strict";

    // BlockUtility: BF2042 Portal 用の独立ユーティリティプラグイン
    const plugin = BF2042Portal.Plugins.getPlugin("BlockUtility");
    let menusRegistered = false;
    let wheelListenerAttached = false;
    let fontControlTimer = null;
    let minimapButton = null;
    let searchButton = null;
    let searchButtonResizeObserver = null;
    let searchButtonMutationObserver = null; // ★これを追加

    function getPortalLanguage() {
        const candidates = [
            document && document.documentElement ? document.documentElement.lang : "",
            typeof navigator !== "undefined" ? navigator.language : ""
        ];
        const lang = candidates.find(v => typeof v === "string" && v.trim()) || "";
        return lang.toLowerCase().startsWith("ja") ? "ja" : "en";
    }

    // ===== 左側ブロックメニュー（Toolbox）の文字サイズ＆行高管理 =====
    const TOOLBOX_FONT_SIZES = [10, 15, 20, 25];

    function getToolboxFontSize() {
        try {
            const val = parseInt(localStorage.getItem("bf6-toolbox-font-size"), 10);
            return Number.isFinite(val) ? Math.max(10, Math.min(25, val)) : 15;
        } catch (_) {
            return 15;
        }
    }

    function setToolboxFontSize(size) {
        const clamped = Math.max(10, Math.min(25, size));
        try { localStorage.setItem("bf6-toolbox-font-size", String(clamped)); } catch (_) { }
        applyToolboxFontSize(clamped);
        return clamped;
    }

    function applyToolboxFontSize(size) {
        let style = document.getElementById("bf6-toolbox-font-style");
        if (!style) {
            style = document.createElement("style");
            style.id = "bf6-toolbox-font-style";
            document.head.appendChild(style);
        }

        let rowHeight = 24;
        let padY = 2;
        if (size <= 10) { rowHeight = 18; padY = 1; }
        else if (size <= 15) { rowHeight = 23; padY = 2; }
        else if (size <= 20) { rowHeight = 28; padY = 2; }
        else { rowHeight = 34; padY = 3; }

        const iconSize = Math.max(10, Math.min(18, size - 2));

        style.textContent = `
          .blocklyToolboxDiv {
            padding-top: 0px !important;
          }
          #bf6-toolbox-font-control-bar {
            margin-top: 0px !important;
            top: 0px !important;
          }
          .blocklyToolboxDiv,
          .blocklyToolboxDiv * {
            box-sizing: border-box !important;
          }
          .blocklyToolboxDiv [role="treeitem"],
          .blocklyToolboxDiv .blocklyTreeRow,
          .blocklyToolboxDiv .blocklyToolboxCategory,
          .blocklyToolboxDiv .blocklyToolboxItem,
          .blocklyToolboxDiv .blocklyTreeRowContentContainer {
            height: ${rowHeight}px !important;
            min-height: ${rowHeight}px !important;
            max-height: ${rowHeight}px !important;
            line-height: ${rowHeight}px !important;
            padding-top: ${padY}px !important;
            padding-bottom: ${padY}px !important;
            margin-top: 0px !important;
            margin-bottom: 0px !important;
            display: flex !important;
            align-items: center !important;
          }
          .blocklyToolboxDiv .blocklyTreeLabel {
            font-size: ${size}px !important;
            line-height: ${rowHeight}px !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .blocklyToolboxDiv .blocklyTreeIcon {
            width: ${iconSize}px !important;
            height: ${iconSize}px !important;
            min-width: ${iconSize}px !important;
            max-height: ${iconSize}px !important;
            margin-right: 5px !important;
            padding: 0 !important;
          }
          .blocklyToolboxDiv .blocklyTreeSeparator {
            margin: 1px 0 !important;
            height: 1px !important;
          }
        `;

        try {
            const items = document.querySelectorAll('.blocklyToolboxDiv [role="treeitem"], .blocklyToolboxDiv .blocklyTreeRow');
            items.forEach(el => {
                el.style.setProperty("height", rowHeight + "px", "important");
                el.style.setProperty("min-height", rowHeight + "px", "important");
                el.style.setProperty("max-height", rowHeight + "px", "important");
                el.style.setProperty("padding-top", padY + "px", "important");
                el.style.setProperty("padding-bottom", padY + "px", "important");
            });
        } catch (_) { }
    }

    function initToolboxFontControl() {
        const tb = document.querySelector(".blocklyToolboxDiv");
        if (!tb || document.getElementById("bf6-toolbox-font-control-bar")) return;

        const isJa = getPortalLanguage() === "ja";
        const bar = document.createElement("div");
        bar.id = "bf6-toolbox-font-control-bar";
        bar.style.cssText = `
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          padding: 5px 10px !important;
          background: rgb(22, 29, 30) !important;
          border-bottom: 1px solid #3a4648 !important;
          color: #fff !important;
          font-size: 12px !important;
          user-select: none !important;
          box-sizing: border-box !important;
          width: 100% !important;
          flex-shrink: 0 !important;
          position: sticky !important;
          top: 0 !important;
          z-index: 100 !important;
        `;

        const label = document.createElement("span");
        label.style.cssText = "color: #9aa5a7; font-size: 11px;";
        label.textContent = isJa ? "フォントサイズ" : "Font Size";

        const fGroup = document.createElement("div");
        fGroup.style.cssText = "display: flex; align-items: center; gap: 6px;";

        const valDisplay = document.createElement("span");
        valDisplay.id = "bf6-toolbox-font-val";
        valDisplay.style.cssText = "font-size: 12px; color: #66ccff; min-width: 32px; text-align: center; font-weight: bold;";
        valDisplay.textContent = getToolboxFontSize() + "px";

        const stepSize = (direction) => {
            const cur = getToolboxFontSize();
            let idx = TOOLBOX_FONT_SIZES.indexOf(cur);
            if (idx === -1) {
                idx = TOOLBOX_FONT_SIZES.reduce((prev, curr, i) => Math.abs(curr - cur) < Math.abs(TOOLBOX_FONT_SIZES[prev] - cur) ? i : prev, 0);
            }
            const nextIdx = Math.max(0, Math.min(TOOLBOX_FONT_SIZES.length - 1, idx + direction));
            const next = setToolboxFontSize(TOOLBOX_FONT_SIZES[nextIdx]);
            valDisplay.textContent = next + "px";
        };

        const createFBtn = (text, dir) => {
            const b = document.createElement("button");
            b.textContent = text;
            b.style.cssText = "background:#2d3839;color:#fff;border:1px solid #556668;border-radius:3px;padding:2px 7px;cursor:pointer;font-size:11px;line-height:1.2;";
            b.addEventListener("mouseenter", () => b.style.background = "#425355");
            b.addEventListener("mouseleave", () => b.style.background = "#2d3839");
            b.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                stepSize(dir);
            });
            return b;
        };

        fGroup.appendChild(createFBtn("◀", -1));
        fGroup.appendChild(valDisplay);
        fGroup.appendChild(createFBtn("▶", 1));

        bar.appendChild(label);
        bar.appendChild(fGroup);

        tb.insertBefore(bar, tb.firstChild);
    }

    function startFontControlMonitor() {
        applyToolboxFontSize(getToolboxFontSize());
        initToolboxFontControl();
        if (!fontControlTimer) {
            fontControlTimer = setInterval(initToolboxFontControl, 500);
        }
    }

    function stopFontControlMonitor() {
        if (fontControlTimer) {
            clearInterval(fontControlTimer);
            fontControlTimer = null;
        }

        // コントローラーバーと追加スタイルの削除
        const bar = document.getElementById("bf6-toolbox-font-control-bar");
        if (bar) bar.remove();
        const style = document.getElementById("bf6-toolbox-font-style");
        if (style) style.remove();

        // DOM要素に付与されたインラインスタイルをすべて消去してページデフォルトに戻す
        try {
            const items = document.querySelectorAll('.blocklyToolboxDiv [role="treeitem"], .blocklyToolboxDiv .blocklyTreeRow, .blocklyToolboxDiv .blocklyTreeLabel, .blocklyToolboxDiv .blocklyTreeIcon');
            items.forEach(el => {
                el.style.removeProperty("height");
                el.style.removeProperty("min-height");
                el.style.removeProperty("max-height");
                el.style.removeProperty("line-height");
                el.style.removeProperty("padding-top");
                el.style.removeProperty("padding-bottom");
                el.style.removeProperty("font-size");
                el.style.removeProperty("width");
            });
        } catch (_) { }

        // ワークスペースの再描画・再計算
        const ws = _Blockly && _Blockly.getMainWorkspace ? _Blockly.getMainWorkspace() : null;
        if (ws && typeof ws.resize === "function") ws.resize();
        window.dispatchEvent(new Event("resize"));
    }

    // ===== サブルーチン関連処理 =====
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

    function stripRuleNumber(name) {
        return String(name == null ? "" : name).replace(/^\d{1,3}:?\s*/, "");
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
                    walk(block);
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

    function blockSearchText() {
        return getPortalLanguage() === "ja" ? "ブロック検索" : "Block Search";
    }

    // ★ここから追加（2）★
    function getBlockUtilityHost() {
        const ws = _Blockly && _Blockly.getMainWorkspace ? _Blockly.getMainWorkspace() : null;
        return (ws && typeof ws.getInjectionDiv === "function" ? ws.getInjectionDiv() : null)
            || document.querySelector(".blocklyInjectionDiv")
            || null;
    }

    function getJapaneseToggleButton(host) {
        if (!host) return null;
        const btn = host.querySelector('[data-japanese-plugin="top-right-toggle"]');
        if (!btn) return null;
        const style = getComputedStyle(btn);
        const rect = btn.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width <= 0 || rect.height <= 0) {
            return null;
        }
        return btn;
    }

    function isElementActuallyVisibleForSearch(el, hostRect) {
        if (!el || !el.isConnected) return false;
        const style = getComputedStyle(el);
        if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            parseFloat(style.opacity) === 0
        ) {
            return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 40) return false;
        if (rect.right <= hostRect.left || rect.left >= hostRect.right) return false;
        return true;
    }

    function getBlockListRightEdgeForSearch(host) {
        const hostRect = host.getBoundingClientRect();
        const selectors = [
            ".blocklyToolboxDiv",
            ".blocklyFlyout",
            '[class*="toolbox" i]',
            '[class*="flyout" i]'
        ];
        let maxRight = 0;

        for (const sel of selectors) {
            for (const el of host.querySelectorAll(sel)) {
                if (
                    el === searchButton || el.contains(searchButton) ||
                    el === minimapButton || (minimapButton && el.contains(minimapButton))
                ) continue;
                if (!isElementActuallyVisibleForSearch(el, hostRect)) continue;

                const rect = el.getBoundingClientRect();
                if (rect.left < hostRect.left + hostRect.width * 0.6) {
                    maxRight = Math.max(maxRight, rect.right);
                }
            }
        }

        return maxRight > 0 ? maxRight : hostRect.left;
    }

    let searchButtonRafId = null;
    let jaButtonStyleObserver = null;

    function scheduleSearchButtonPositionUpdate() {
        if (searchButtonRafId) return;
        searchButtonRafId = requestAnimationFrame(() => {
            searchButtonRafId = null;
            updateSearchButtonPosition();
        });
    }

    function bindJaButtonStyleObserver(jaBtn) {
        if (!jaBtn || typeof MutationObserver === "undefined") return;
        if (jaButtonStyleObserver && jaButtonStyleObserver._target === jaBtn) return;
        if (jaButtonStyleObserver) {
            jaButtonStyleObserver.disconnect();
        }
        jaButtonStyleObserver = new MutationObserver(() => {
            scheduleSearchButtonPositionUpdate();
        });
        jaButtonStyleObserver.observe(jaBtn, {
            attributes: true,
            attributeFilter: ["style", "class"]
        });
        jaButtonStyleObserver._target = jaBtn;
    }

    function updateSearchButtonPosition() {
        if (!searchButton && !minimapButton) return;
        const host = getBlockUtilityHost();
        if (!host) {
            if (searchButton) searchButton.style.display = "none";
            if (minimapButton) minimapButton.style.display = "none";
            return;
        }
        if (searchButton && searchButton.parentElement !== host) {
            host.appendChild(searchButton);
        }
        if (minimapButton && minimapButton.parentElement !== host) {
            host.appendChild(minimapButton);
        }

        const hostRect = host.getBoundingClientRect();
        if (hostRect.width <= 0 || hostRect.height <= 0) {
            if (searchButton) searchButton.style.display = "none";
            if (minimapButton) minimapButton.style.display = "none";
            return;
        }

        const jaBtn = getJapaneseToggleButton(host);
        let anchorRight;
        let anchorTop = 10;

        if (jaBtn) {
            bindJaButtonStyleObserver(jaBtn);
            const jaRect = jaBtn.getBoundingClientRect();
            anchorRight = jaRect.right;
            anchorTop = Math.round(jaRect.top - hostRect.top);
        } else {
            anchorRight = getBlockListRightEdgeForSearch(host);
        }

        const topPx = Math.max(6, anchorTop);
        const searchWidth = searchButton ? (searchButton.offsetWidth || 34) : 0;
        const minimapWidth = minimapButton ? (minimapButton.offsetWidth || 34) : 0;
        const gap = 8;
        const totalWidth = searchWidth + (searchButton && minimapButton ? gap : 0) + minimapWidth;

        let desiredLeft = Math.round(anchorRight - hostRect.left + gap);
        const maxLeft = Math.max(10, Math.round(hostRect.width - totalWidth - 10));
        desiredLeft = Math.max(10, Math.min(maxLeft, desiredLeft));

        if (searchButton) {
            searchButton.style.display = "flex";
            searchButton.style.top = `${topPx}px`;
            searchButton.style.left = `${desiredLeft}px`;
            searchButton.style.right = "auto";
        }

        if (minimapButton) {
            const mapLeft = searchButton ? (desiredLeft + searchWidth + gap) : desiredLeft;
            minimapButton.style.display = "flex";
            minimapButton.style.top = `${topPx}px`;
            minimapButton.style.left = `${mapLeft}px`;
            minimapButton.style.right = "auto";
        }
    }

    function bindSearchButtonResizeObserver() {
        const host = getBlockUtilityHost();
        if (!host) return;

        if (typeof ResizeObserver !== "undefined") {
            if (searchButtonResizeObserver) {
                searchButtonResizeObserver.disconnect();
            }
            searchButtonResizeObserver = new ResizeObserver(() => {
                scheduleSearchButtonPositionUpdate();
            });
            searchButtonResizeObserver.observe(host);
            host.querySelectorAll(".blocklyToolboxDiv, .blocklyFlyout").forEach(el => {
                searchButtonResizeObserver.observe(el);
            });
        }

        if (searchButtonMutationObserver) {
            searchButtonMutationObserver.disconnect();
        }
        searchButtonMutationObserver = new MutationObserver(() => {
            scheduleSearchButtonPositionUpdate();
        });
        searchButtonMutationObserver.observe(host, {
            attributes: true,
            attributeFilter: ["style", "class"],
            childList: true,
            subtree: true
        });

        const jaBtn = getJapaneseToggleButton(host);
        if (jaBtn) bindJaButtonStyleObserver(jaBtn);
    }

    function ensureSearchButton() {
        const host = getBlockUtilityHost();
        if (!host) return;

        if (!searchButton) {
            const ja = getPortalLanguage() === "ja";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.id = "bf6-block-search-toggle-btn";
            btn.title = ja ? "ブロック検索を開く" : "Open Block Search";
            // 虫眼鏡アイコン
            btn.innerHTML = `
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2.1"/>
                    <path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>
                </svg>
            `;
            btn.style.cssText = [
                "position:absolute",
                "top:10px",
                "left:10px",
                "z-index:95",
                "width:34px",
                "height:34px",
                "padding:0",
                "border-radius:6px",
                "border:1.5px solid #55dfff",
                "background:rgba(20,34,42,0.92)",
                "color:#55dfff",
                "display:flex",
                "align-items:center",
                "justify-content:center",
                "cursor:pointer",
                "box-shadow:0 2px 8px rgba(0,0,0,0.45)",
                "transition:background 0.15s ease,color 0.15s ease"
            ].join(";");

            btn.addEventListener("mouseenter", () => {
                btn.style.background = "rgba(28,100,117,0.95)";
                btn.style.color = "#ffffff";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "rgba(20,34,42,0.92)";
                btn.style.color = "#55dfff";
            });
            btn.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                if (blockSearchPanel && blockSearchPanel.style.display !== "none") {
                    blockSearchPanel.style.display = "none";
                    removeBlockSearchHighlight();
                } else {
                    const ws = _Blockly && _Blockly.getMainWorkspace ? _Blockly.getMainWorkspace() : null;
                    const selected = ws && typeof ws.getSelected === "function" ? ws.getSelected() : null;
                    openBlockSearch(selected || null);
                }
            }, true);

            searchButton = btn;
        }

        if (searchButton.parentElement !== host) {
            host.appendChild(searchButton);
        }
        bindSearchButtonResizeObserver();
        updateSearchButtonPosition();
    }

    function updateMinimapButtonUI() {
        if (!minimapButton) return;
        const ja = getPortalLanguage() === "ja";
        minimapButton.title = minimapIsOpen
            ? (ja ? "全体マップを閉じる" : "Close Minimap")
            : (ja ? "全体マップを開く" : "Open Minimap");
        minimapButton.style.borderColor = minimapIsOpen ? "#ff85c8" : "#55dfff";
        minimapButton.style.color = minimapIsOpen ? "#ff85c8" : "#55dfff";
        minimapButton.style.background = minimapIsOpen
            ? "rgba(56,24,42,0.94)"
            : "rgba(20,34,42,0.92)";
    }

    function ensureMinimapButton() {
        const host = getBlockUtilityHost();
        if (!host) return;

        if (!minimapButton) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.id = "bf6-minimap-toggle-btn";
            // 折りたたみマップ風のSVGアイコン
            btn.innerHTML = `
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 6.5L9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
                    <path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.7"/>
                </svg>
            `;
            btn.style.cssText = [
                "position:absolute",
                "top:10px",
                "left:10px",
                "z-index:95",
                "width:34px",
                "height:34px",
                "padding:0",
                "border-radius:6px",
                "border:1.5px solid #55dfff",
                "background:rgba(20,34,42,0.92)",
                "color:#55dfff",
                "display:flex",
                "align-items:center",
                "justify-content:center",
                "cursor:pointer",
                "box-shadow:0 2px 8px rgba(0,0,0,0.45)",
                "transition:background 0.15s ease,color 0.15s ease,border-color 0.15s ease"
            ].join(";");

            btn.addEventListener("mouseenter", () => {
                btn.style.background = minimapIsOpen ? "rgba(84,32,62,0.96)" : "rgba(28,100,117,0.95)";
                btn.style.color = "#ffffff";
            });
            btn.addEventListener("mouseleave", () => {
                updateMinimapButtonUI();
            });
            btn.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                toggleMinimap();
            }, true);

            minimapButton = btn;
            updateMinimapButtonUI();
        }

        if (minimapButton.parentElement !== host) {
            host.appendChild(minimapButton);
        }
        updateSearchButtonPosition();
    }

    // ★ここまで追加（2）★
    // ===== マウスホイールによるスクロール処理 =====
    function handleWorkspaceWheel(event) {
        const isShift = event.shiftKey;
        const isCtrl = event.ctrlKey || event.metaKey;

        if (!isShift && !isCtrl) return;

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

        event.preventDefault();
        event.stopPropagation();

        let delta = event.deltaY;
        if (event.deltaMode === 1) delta *= 33;
        else if (event.deltaMode === 2) delta *= 100;

        let deltaX = 0;
        let deltaY = 0;

        if (isShift) {
            const dx = event.deltaX !== 0 ? event.deltaX : delta;
            deltaX = -dx;
        } else if (isCtrl) {
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
    let minimapZoom = 1;
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
            const sum = childWidths.reduce((acc, w) => acc + w, 0);
            baseWidth = sum / childWidths.length;
        } else {
            baseWidth = fallbackWidth > 0 ? fallbackWidth : 120;
        }

        const singleWidth = Math.max(80, Math.min(1200, Math.round(baseWidth)));
        return (singleWidth * singleWidth) / 100;
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
                targetScrollX = -(xy.x * data.scale) + 50;
                targetScrollY = -(xy.y * data.scale) + 50;
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
        updateMinimapButtonUI(); // ★この1行を追加
    }
        


    function initScrollWheel() {
        if (wheelListenerAttached) return;
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
            startFontControlMonitor();
            ensureSearchButton();
            ensureMinimapButton();
            window.addEventListener("resize", scheduleSearchButtonPositionUpdate, { passive: true });
            setTimeout(updateSearchButtonPosition, 200);

        } catch (e) {
            if (BF2042Portal.Shared && typeof BF2042Portal.Shared.logError === "function") {
                BF2042Portal.Shared.logError("BlockUtility initialization", String(e));
            }
        }
    };

    plugin.dispose = function () {
        // プラグインOFF時にフォント設定・バーを完全消去してデフォルト表示に戻す
        stopFontControlMonitor();

        window.removeEventListener("resize", scheduleSearchButtonPositionUpdate);
        if (searchButtonRafId) {
            cancelAnimationFrame(searchButtonRafId);
            searchButtonRafId = null;
        }
        if (jaButtonStyleObserver) {
            jaButtonStyleObserver.disconnect();
            jaButtonStyleObserver = null;
        }

        // ★ ここにそのまま入れる ★
        if (minimapButton) {
            minimapButton.remove();
            minimapButton = null;
        }
    };
})();
