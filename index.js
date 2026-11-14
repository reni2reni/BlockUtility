/* global BF2042Portal, _Blockly */
(function () {
    "use strict";

    // BlockUtility: BF2042 Portal 用の独立ユーティリティプラグイン
    const plugin = BF2042Portal.Plugins.getPlugin("BlockUtility");
    let menusRegistered = false;

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
        } catch (_) {}
        const extraName = block.extraState && block.extraState.subroutineName;
        return extraName != null && String(extraName).trim() !== "" ? String(extraName) : null;
    }

    function getSubroutineBlockName(block) {
        if (!block || block.type !== "subroutineBlock") return null;
        try {
            const field = typeof block.getField === "function" ? block.getField("SUBROUTINE_NAME") : null;
            const value = field && typeof field.getValue === "function" ? field.getValue() : null;
            if (value != null && String(value).trim() !== "") return String(value);
        } catch (_) {}
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
        } catch (_) {}
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
            } catch (_) {}
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
        } catch (_) {}
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
        } catch (_) {}
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
        } catch (_) {}

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
        } catch (_) {}
        try {
            if (Array.isArray(block.inputList)) {
                for (const input of block.inputList) {
                    if (!input || !Array.isArray(input.fieldRow)) continue;
                    for (const field of input.fieldRow) {
                        if (!field) continue;
                        try {
                            if (typeof field.getText === "function") parts.push(String(field.getText() || ""));
                            else if (typeof field.getValue === "function") parts.push(String(field.getValue() || ""));
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
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
            } catch (_) {}
        }
        blockSearchHighlightStyles = [];
        blockSearchHighlight = null;
    }

    function updateBlockSearchHighlight(block) {
        removeBlockSearchHighlight();
        if (!block || typeof block.getSvgRoot !== "function") return;
        const root = block.getSvgRoot();
        if (!root) return;

        // Blocklyのブロック自身のSVGへ枠線を付ける。
        // 画面固定のDIVではないので、ズーム・パン・移動に追従する。
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

        // SubRoutine・変数・文字列など、ブロック上で右クリックした場合は
        // そのブロックの入力テキストを検索欄へ自動投入する。
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
                        } catch (_) {}
                        if (!text) continue;
                        const name = String(field.name || "").toUpperCase();
                        fields.push({ field, name, text });
                    }
                }
            }
        } catch (_) {}

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

        // 検索ではBlocklyの通常選択を使わず、検索対象ブロック自身の
        // SVG枠だけを表示する。これにより連結ブロックや子ブロックまで
        // 一緒に選択されることを防ぐ。
        try {
            const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
            for (const candidate of ws?.getAllBlocks?.(false) || []) {
                try {
                    if (typeof candidate.unselect === "function") candidate.unselect();
                } catch (_) {}
            }
        } catch (_) {}

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
        } catch (_) {}
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
        } catch (_) {}
        return descendants;
    }

    function isOuterSearchMatch(block, query) {
        if (!block || !query) return false;
        // ブロックの中にさらに検索対象となる子ブロックがある場合、
        // 外側のブロックは数えない。
        // 例: 「変数」を表示する外側ブロックの中に
        // 変数そのもののブロックが入っている場合は、内側だけを対象にする。
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
            try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
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

        menusRegistered = true;
    }

    plugin.initializeWorkspace = async function () {
        try { registerMenus(); }
        catch (e) {
            if (BF2042Portal.Shared && typeof BF2042Portal.Shared.logError === "function") {
                BF2042Portal.Shared.logError("BlockUtility menu registration", String(e));
            }
        }
    };
})();
