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

    // NAME / SUBROUTINE_NAME を持つすべてのブロックを対象とする簡易検索。
    const sameNameCycle = new Map();

    function getGenericBlockName(block) {
        if (!block) return null;
        for (const fieldName of ["NAME", "SUBROUTINE_NAME"]) {
            try {
                const field = typeof block.getField === "function" ? block.getField(fieldName) : null;
                const value = field && typeof field.getValue === "function" ? field.getValue() : null;
                if (value != null && String(value).trim() !== "") return String(value);
            } catch (_) {}
        }
        return null;
    }

    function goToSameNameBlock(block) {
        if (!block) return false;
        const name = getGenericBlockName(block);
        if (!name) return false;

        const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
        if (!ws || typeof ws.getAllBlocks !== "function") return false;

        const targets = getBlocksInVisualOrder(ws.getAllBlocks(false).filter(candidate =>
            candidate && candidate !== block && getGenericBlockName(candidate) === name
        ));
        if (!targets.length) return false;

        const key = String(block.id || "") + "::" + name;
        const previousId = sameNameCycle.get(key);
        let index = previousId
            ? targets.findIndex(target => String(target.id) === String(previousId)) + 1
            : 0;
        if (index >= targets.length) index = 0;

        const target = targets[index];
        if (!selectAndCenter(target)) return false;
        sameNameCycle.set(key, target.id);
        return true;
    }

    function sameNameText() {
        return getPortalLanguage() === "ja" ? "同名ブロック移動" : "Go to Same-Name Block";
    }

    function subroutineText(direction) {
        const ja = getPortalLanguage() === "ja";
        return direction === "source"
            ? (ja ? "サブルーチン元へ移動" : "Go to Subroutine Source")
            : (ja ? "サブルーチンへ移動" : "Go to Subroutine");
    }

    function ruleNumberText() {
        return getPortalLanguage() === "ja" ? "ルール番号付加" : "Add Rule Numbers";
    }

    function registerMenus() {
        if (menusRegistered) return;
        const Scope = _Blockly.ContextMenuRegistry.ScopeType;

        const sameNameItem = {
            id: "blockUtilityGoToSameName",
            displayText: () => sameNameText(),
            scopeType: Scope.BLOCK,
            weight: 90,
            preconditionFn: scope => {
                const block = scope && scope.block;
                if (!block || !getGenericBlockName(block)) return "hidden";
                const ws = block.workspace || (_Blockly.getMainWorkspace && _Blockly.getMainWorkspace());
                if (!ws || typeof ws.getAllBlocks !== "function") return "hidden";
                const name = getGenericBlockName(block);
                return ws.getAllBlocks(false).some(candidate =>
                    candidate && candidate !== block && getGenericBlockName(candidate) === name
                ) ? "enabled" : "hidden";
            },
            callback: scope => {
                if (scope && scope.block) goToSameNameBlock(scope.block);
            }
        };
        plugin.registerItem(sameNameItem);
        _Blockly.ContextMenuRegistry.registry.register(sameNameItem);

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
