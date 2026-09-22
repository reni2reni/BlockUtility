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
            ? (ja ? "サブルーチン元へ移動" : "Go to Subroutine Source")
            : (ja ? "サブルーチンへ移動" : "Go to Subroutine");
    }

    function ruleNumberText() {
        return getPortalLanguage() === "ja" ? "ルール番号付加" : "Add Rule Numbers";
    }


    // ================================================================
    // Copy / Cut / Paste (multi-select)
    // BF6PORTAL の旧 ExperienceManager 拡張から移設した実装。
    // ================================================================
    const clipboardState = { lastBlockJson: null };
    const multiSelectedBlockIds = new Set();
    let contextSelectedBlockIds = [];
    let multiSelectionInstalled = false;
    let clipboardMenusRegistered = false;

    function copyTextToClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            return navigator.clipboard.writeText(String(text ?? ""));
        }
        const ta = document.createElement("textarea");
        ta.value = String(text ?? "");
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        const ok = document.execCommand("copy"); ta.remove();
        if (!ok) throw new Error("Clipboard copy failed");
        return Promise.resolve(true);
    }

    async function readTextFromClipboard() {
        try {
            if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
        } catch (_) {}
        return null;
    }

    function getBlockElement(blockId) {
        try { return document.querySelector(`g[data-id="${CSS.escape(String(blockId))}"]`); }
        catch (_) { return null; }
    }

    function paintMultiSelection() {
        try {
            document.querySelectorAll("path.bf6-path-selected").forEach(el => el.classList.remove("bf6-path-selected"));
            for (const id of multiSelectedBlockIds) {
                getBlockElement(id)?.querySelectorAll("path").forEach(path => path.classList.add("bf6-path-selected"));
            }
        } catch (_) {}
    }

    function clearMultiSelection() {
        multiSelectedBlockIds.clear(); contextSelectedBlockIds = []; paintMultiSelection();
    }

    function getBlockIdFromEvent(event) {
        try {
            const g = event?.target?.closest?.("g[data-id]");
            const id = g?.getAttribute?.("data-id") || g?.dataset?.id;
            return id ? String(id) : null;
        } catch (_) { return null; }
    }

    function addOrToggleMultiSelection(id) {
        id = String(id);
        if (multiSelectedBlockIds.has(id)) multiSelectedBlockIds.delete(id);
        else multiSelectedBlockIds.add(id);
        paintMultiSelection();
        return Array.from(multiSelectedBlockIds);
    }

    function getSelectedBlockIds(scopeBlock) {
        if (contextSelectedBlockIds.length) return Array.from(contextSelectedBlockIds);
        if (multiSelectedBlockIds.size) return Array.from(multiSelectedBlockIds);
        return scopeBlock?.id != null ? [String(scopeBlock.id)] : [];
    }

    function traverseSerializedBlocks(node, cb) {
        if (!node) return;
        cb(node);
        if (node.inputs && typeof node.inputs === "object") {
            for (const input of Object.values(node.inputs)) {
                if (input?.block) traverseSerializedBlocks(input.block, cb);
                if (input?.shadow) traverseSerializedBlocks(input.shadow, cb);
            }
        }
        if (node.next?.block) traverseSerializedBlocks(node.next.block, cb);
    }

    function extractBlockForClipboard(block) {
        const Blockly = window._Blockly || window.Blockly;
        try {
            const full = Blockly.serialization.blocks.save(block);
            if (full?.next) delete full.next;
            return full;
        } catch (_) {
            try {
                if (Blockly.Xml) {
                    const xml = Blockly.Xml.blockToDom(block, true);
                    return { _legacyXml: Blockly.Xml.domToText(xml) };
                }
            } catch (_) {}
            return null;
        }
    }

    function extractVariableDefinitions(serializedRoot) {
        const varsById = new Map();
        traverseSerializedBlocks(serializedRoot, b => {
            if (!b.fields?.VAR) return;
            const raw = b.fields.VAR;
            let id = null, name = null, type = "";
            if (raw && typeof raw === "object") { id = raw.id || null; name = raw.name || null; type = raw.type || ""; }
            else if (typeof raw === "string") name = raw;
            const isObjectVar = !!b.extraState?.isObjectVar;
            if (name) {
                const key = id || name + "::" + type;
                if (!varsById.has(key)) varsById.set(key, { id, name, type, isObjectVar });
            }
        });
        return Array.from(varsById.values());
    }

    function registerVariablesBeforePaste(ws, varDefs) {
        try {
            const varMap = ws.getVariableMap?.();
            for (const v of varDefs) {
                let existing = null;
                try { existing = varMap?.getVariable?.(v.id) || null; } catch (_) {}
                try { if (!existing) existing = varMap?.getVariableById?.(v.id) || null; } catch (_) {}
                try { if (!existing) existing = varMap?.getVariableByName?.(v.name) || null; } catch (_) {}
                if (existing) continue;
                try { varMap?.createVariable ? varMap.createVariable(v.name, v.type || "", v.id) : ws.createVariable?.(v.name, v.type || "", v.id); }
                catch (_) { try { varMap?.createVariable?.(v.name, v.type || "", undefined); } catch (_) {} }
            }
        } catch (_) {}
    }

    function ensureVariableExists(ws, name, type) {
        try {
            const varMap = ws.getVariableMap?.();
            if (!varMap) return null;
            let existing = null;
            try { existing = varMap.getVariable?.(name) || null; } catch (_) {}
            try { if (!existing) existing = varMap.getVariableByName?.(name) || null; } catch (_) {}
            if (!existing) return varMap.createVariable?.(name, type || "", undefined) || ws.createVariable?.(name, type || "", undefined);
            return existing;
        } catch (_) { return null; }
    }

    function sanitizeForWorkspace(ws, root) {
        traverseSerializedBlocks(root, b => {
            if (b.type === "variableReferenceBlock" || b.type === "subroutineArgumentBlock" || !b.fields) return;
            for (const [key, val] of Object.entries(b.fields)) {
                const ku = key.toUpperCase();
                if (ku === "VAR" || ku === "VARIABLE" || ku.startsWith("VAR")) {
                    let varName = val;
                    if (val && typeof val === "object" && val.name) varName = val.name;
                    if (typeof varName === "string" && varName.length) ensureVariableExists(ws, varName, val?.type || "");
                }
            }
        });
        return root;
    }

    function renameSubroutineIfNeeded(ws, data) {
        try {
            if (!data || data.type !== "subroutineBlock") return data;
            const originalName = data.extraState?.subroutineName || data.fields?.SUBROUTINE_NAME;
            if (!originalName) return data;
            const names = new Set();
            for (const b of ws.getAllBlocks(false)) {
                if (b.type !== "subroutineBlock") continue;
                const name = b.extraState?.subroutineName || b.getField?.("SUBROUTINE_NAME")?.getValue();
                if (name) names.add(name);
            }
            if (!names.has(originalName)) return data;
            let i = 1, newName = originalName + i;
            while (names.has(newName)) newName = originalName + (++i);
            if (data.extraState) data.extraState.subroutineName = newName;
            if (data.fields) data.fields.SUBROUTINE_NAME = newName;
            traverseSerializedBlocks(data, b => {
                if (b.fields?.SUBROUTINE_NAME === originalName) b.fields.SUBROUTINE_NAME = newName;
            });
        } catch (_) {}
        return data;
    }

    function createBlockInstance(ws, data) {
        const Blockly = window._Blockly || window.Blockly;
        const varDefs = extractVariableDefinitions(data);
        if (varDefs.length) registerVariablesBeforePaste(ws, varDefs);
        data = sanitizeForWorkspace(ws, renameSubroutineIfNeeded(ws, data));
        const existing = new Set(ws.getAllBlocks(false));
        let created = null;
        try {
            if (Blockly.serialization?.blocks?.append) created = Blockly.serialization.blocks.append(data, ws);
            else if (data._legacyXml && Blockly.Xml) created = Blockly.Xml.domToBlock(Blockly.Xml.textToDom(data._legacyXml), ws);
        } catch (_) {}
        if (!created || typeof created.initSvg !== "function") {
            for (const b of ws.getAllBlocks(false)) if (!existing.has(b) && !b.getParent()) { created = b; break; }
        }
        return created;
    }

    function getWorkspaceCoords(ws, e) {
        try {
            const canvas = ws.getCanvas?.() || document.querySelector(".blocklyBlockCanvas");
            if (canvas?.ownerSVGElement && canvas.getScreenCTM) {
                const pt = canvas.ownerSVGElement.createSVGPoint();
                pt.x = e.clientX; pt.y = e.clientY;
                const ctm = canvas.getScreenCTM();
                if (ctm?.inverse) { const p = pt.matrixTransform(ctm.inverse()); return { x: p.x, y: p.y }; }
            }
        } catch (_) {}
        const metrics = ws.getMetrics?.() || {};
        return { x: (metrics.viewLeft || 0) + 50, y: (metrics.viewTop || 0) + 50 };
    }

    function autoConnectBlock(createdBlock) {
        if (!createdBlock?.workspace) return;
        const ws = createdBlock.workspace, myConns = [];
        if (createdBlock.outputConnection) myConns.push(createdBlock.outputConnection);
        if (createdBlock.previousConnection) myConns.push(createdBlock.previousConnection);
        const last = createdBlock.lastConnectionInStack ? createdBlock.lastConnectionInStack() : createdBlock;
        if (last?.nextConnection) myConns.push(last.nextConnection);
        let bestDist = 75, bestMy = null, bestTarget = null;
        for (const other of ws.getAllBlocks(false)) {
            if (other === createdBlock || other.getRootBlock?.() === createdBlock) continue;
            const targets = [];
            if (other.previousConnection) targets.push(other.previousConnection);
            if (other.nextConnection) targets.push(other.nextConnection);
            if (other.inputList) for (const input of other.inputList) if (input.connection) targets.push(input.connection);
            for (const myC of myConns) for (const tC of targets) {
                let can = false;
                try { can = tC.canConnectWithReason_ ? tC.canConnectWithReason_(myC) <= 1 : tC.isConnectionAllowed ? tC.isConnectionAllowed(myC) : true; } catch (_) {}
                if (!can) continue;
                const dist = Math.hypot(myC.x - tC.x, myC.y - tC.y);
                if (dist < bestDist) { bestDist = dist; bestMy = myC; bestTarget = tC; }
            }
        }
        if (bestMy && bestTarget) {
            try { bestTarget.type === 1 || bestTarget.type === 3 ? bestTarget.connect(bestMy) : bestMy.connect(bestTarget); createdBlock.render?.(); } catch (_) {}
        }
    }

    function getClipboardRoots(ws, ids, fallbackBlock) {
        const selectedBlocks = [], seen = new Set();
        for (const id of ids) {
            try {
                const b = ws.getBlockById?.(String(id)) || ws.getAllBlocks?.(false)?.find(x => String(x?.id) === String(id));
                if (b && !seen.has(String(b.id))) { seen.add(String(b.id)); selectedBlocks.push(b); }
            } catch (_) {}
        }
        if (!selectedBlocks.length && fallbackBlock) selectedBlocks.push(fallbackBlock);
        const selectedSet = new Set(selectedBlocks);
        return selectedBlocks.filter(b => {
            let p = b.getParent?.() || null;
            if (!p) return true;
            while (p) {
                if (selectedSet.has(p)) {
                    let isInputChild = false;
                    try { isInputChild = Array.isArray(p.inputList) && p.inputList.some(input => input?.connection?.targetBlock?.() === b); } catch (_) {}
                    if (isInputChild) return false;
                }
                p = p.getParent?.() || null;
            }
            return true;
        });
    }

    async function copyBlocks(scopeBlock) {
        const ws = scopeBlock?.workspace || _Blockly.getMainWorkspace?.();
        if (!ws) return;
        const roots = getClipboardRoots(ws, getSelectedBlockIds(scopeBlock), scopeBlock);
        const blocks = roots.map(extractBlockForClipboard).filter(Boolean);
        if (!blocks.length) return;
        const data = blocks.length > 1 ? { _bf6MultiBlockClipboard: 1, blocks } : blocks[0];
        const jsonText = JSON.stringify(data, null, 2);
        clipboardState.lastBlockJson = jsonText;
        await copyTextToClipboard(jsonText);
    }

    async function cutBlocks(scopeBlock) {
        const ws = scopeBlock?.workspace || _Blockly.getMainWorkspace?.();
        if (!ws) return;
        const roots = getClipboardRoots(ws, getSelectedBlockIds(scopeBlock), scopeBlock);
        const blocks = roots.map(extractBlockForClipboard).filter(Boolean);
        if (!blocks.length) return;
        const data = blocks.length > 1 ? { _bf6MultiBlockClipboard: 1, blocks } : blocks[0];
        const jsonText = JSON.stringify(data, null, 2);
        clipboardState.lastBlockJson = jsonText;
        await copyTextToClipboard(jsonText);
        for (const b of roots) try { b.dispose?.(true, true); } catch (_) {}
        ws.resizeContents?.(); clearMultiSelection();
    }

    async function pasteBlocks() {
        const Blockly = window._Blockly || window.Blockly, ws = _Blockly.getMainWorkspace?.();
        if (!ws) return;
        const raw = (await readTextFromClipboard()) || clipboardState.lastBlockJson;
        if (!raw) return;
        let data; try { data = JSON.parse(raw); } catch (_) { return; }
        const validBlocks = data?._bf6MultiBlockClipboard === 1 && Array.isArray(data.blocks) ? data.blocks.filter(Boolean) : [data].filter(Boolean);
        if (!validBlocks.length) return;
        if (Blockly.Events?.disable) Blockly.Events.disable();
        const createdBlocks = [];
        try {
            const host = window.__BF2042_PLUGIN_HOST__;
            const mouse = host?.lastMouse || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const base = getWorkspaceCoords(ws, mouse);
            const positions = validBlocks.map((d, i) => ({ x: Number.isFinite(Number(d?.x)) ? Number(d.x) : i * 40, y: Number.isFinite(Number(d?.y)) ? Number(d.y) : i * 40 }));
            const minX = Math.min(...positions.map(p => p.x)), minY = Math.min(...positions.map(p => p.y));
            for (let i = 0; i < validBlocks.length; i++) {
                const b = createBlockInstance(ws, validBlocks[i]); if (!b) continue;
                const Coordinate = Blockly.utils?.Coordinate || function(x, y) { this.x = x; this.y = y; };
                b.moveTo?.(new Coordinate(base.x + positions[i].x - minX, base.y + positions[i].y - minY));
                b.render?.(); createdBlocks.push(b);
            }
            if (createdBlocks.length === 1) autoConnectBlock(createdBlocks[0]);
            ws.resizeContents?.();
        } finally { Blockly.Events?.enable?.(); }
        if (createdBlocks.length && Blockly.Events?.fire) {
            const CreateEvent = Blockly.Events.BlockCreate || Blockly.Events.Create;
            if (typeof CreateEvent === "function") for (const b of createdBlocks) try { Blockly.Events.fire(new CreateEvent(b)); } catch (_) {}
        }
    }

    function installMultiSelection() {
        if (multiSelectionInstalled) return;
        multiSelectionInstalled = true;
        if (!document.getElementById("blockUtility-multi-select-style")) {
            const style = document.createElement("style");
            style.id = "blockUtility-multi-select-style";
            style.textContent = `path.bf6-path-selected { stroke:#66ccff !important; stroke-width:3px !important; filter:brightness(1.18); }`;
            document.head.appendChild(style);
        }
        document.addEventListener("click", e => {
            if (e.button !== undefined && e.button !== 0) return;
            const id = getBlockIdFromEvent(e);
            if (!id) { if (!e.shiftKey) clearMultiSelection(); return; }
            if (e.shiftKey) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); addOrToggleMultiSelection(id);
            } else clearMultiSelection();
        }, true);
        document.addEventListener("contextmenu", e => {
            const id = getBlockIdFromEvent(e);
            if (id && !multiSelectedBlockIds.has(id)) { multiSelectedBlockIds.clear(); multiSelectedBlockIds.add(id); paintMultiSelection(); }
            contextSelectedBlockIds = Array.from(multiSelectedBlockIds);
        }, true);
        new MutationObserver(() => { if (multiSelectedBlockIds.size) paintMultiSelection(); })
            .observe(document.body || document.documentElement, { childList:true, subtree:true });
    }

    function registerClipboardMenus() {
        if (clipboardMenusRegistered) return;
        clipboardMenusRegistered = true; installMultiSelection();
        const Scope = _Blockly.ContextMenuRegistry.ScopeType;
        const items = [
            { id:"blockUtilityCopyBlock", displayText:() => getPortalLanguage()==="ja"?"コピー":"Copy", scopeType:Scope.BLOCK, weight:110,
              preconditionFn:s => s?.block?"enabled":"hidden", callback:s => copyBlocks(s.block).catch(e => BF2042Portal.Shared?.logError?.("BlockUtility copy",String(e))) },
            { id:"blockUtilityCutBlock", displayText:() => getPortalLanguage()==="ja"?"切り取り":"Cut", scopeType:Scope.BLOCK, weight:109,
              preconditionFn:s => s?.block?"enabled":"hidden", callback:s => cutBlocks(s.block).catch(e => BF2042Portal.Shared?.logError?.("BlockUtility cut",String(e))) },
            { id:"blockUtilityPasteBlock", displayText:() => getPortalLanguage()==="ja"?"貼り付け":"Paste", scopeType:Scope.WORKSPACE, weight:110,
              preconditionFn:()=>"enabled", callback:() => pasteBlocks().catch(e => BF2042Portal.Shared?.logError?.("BlockUtility paste",String(e))) }
        ];
        for (const item of items) {
            plugin.registerItem(item);
            _Blockly.ContextMenuRegistry.registry.register(item);
        }
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
            registerClipboardMenus();
        }
        catch (e) {
            if (BF2042Portal.Shared && typeof BF2042Portal.Shared.logError === "function") {
                BF2042Portal.Shared.logError("BlockUtility menu registration", String(e));
            }
        }
    };
})();
