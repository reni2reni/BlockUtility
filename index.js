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
    // Copy / Cut / Paste + Shift multi-select
    // ================================================================
    const clipboardState = { lastBlockJson: null };
    // 最後に記録したマウス位置。ペーストはこの位置を基準にする。
    let lastCursorClientPoint = { x: 0, y: 0 };
    const multiSelectedBlockIds = new Set();
    let contextSelectedBlockIds = [];
    let multiSelectionInstalled = false;
    let clipboardMenusRegistered = false;

    function getMainWorkspace() {
        try { return _Blockly.getMainWorkspace?.() || null; } catch (_) { return null; }
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            return navigator.clipboard.writeText(String(text ?? ""));
        }
        const ta = document.createElement("textarea");
        ta.value = String(text ?? "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        if (!ok) throw new Error("Clipboard copy failed");
        return Promise.resolve(true);
    }

    async function readTextFromClipboard() {
        try {
            if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
        } catch (_) {}
        return null;
    }

    function getBlockIdFromEvent(event) {
        try {
            const target = event?.target;
            if (!target) return null;

            // まず composedPath を使う。SVGのpath/g要素、Shadow DOM等でも拾いやすい。
            const path = typeof event.composedPath === "function" ? event.composedPath() : [];
            for (const el of path) {
                if (!el || typeof el.getAttribute !== "function") continue;
                const id = el.getAttribute("data-id") || el.dataset?.id;
                if (id) return String(id);
            }

            // 通常のSVG DOM。
            const g = target.closest?.("g[data-id]");
            if (g) {
                const id = g.getAttribute("data-id") || g.dataset?.id;
                if (id) return String(id);
            }

            // BlocklyのSVG rootからblockを逆引きするフォールバック。
            const ws = getMainWorkspace();
            const blocks = ws?.getAllBlocks?.(false) || [];
            for (const block of blocks) {
                const root = block?.getSvgRoot?.();
                if (root && (root === target || root.contains?.(target))) return String(block.id);
            }
        } catch (_) {}
        return null;
    }

    function getBlockElement(blockId) {
        if (!blockId) return null;
        try {
            const ws = getMainWorkspace();
            const block = ws?.getBlockById?.(String(blockId));
            const root = block?.getSvgRoot?.();
            if (root) return root;
        } catch (_) {}
        try {
            const id = String(blockId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            return document.querySelector(`g[data-id="${id}"]`);
        } catch (_) { return null; }
    }

    function paintMultiSelection() {
        try {
            document.querySelectorAll(".bf6-path-selected").forEach(el =>
                el.classList.remove("bf6-path-selected")
            );

            // 選択したブロック自身の直属blocklyPathだけを塗る。
            // getDescendants/querySelectorAllで子ブロックを拾わない。
            for (const id of multiSelectedBlockIds) {
                const blockEl = getBlockElement(id);
                if (!blockEl) continue;
                for (const child of blockEl.children || []) {
                    if (child.tagName?.toLowerCase() === "path" && child.classList?.contains("blocklyPath")) {
                        child.classList.add("bf6-path-selected");
                    }
                }
            }
        } catch (_) {}
    }

    function clearMultiSelection() {
        multiSelectedBlockIds.clear();
        contextSelectedBlockIds = [];
        document.querySelectorAll(".bf6-path-selected").forEach(el => el.classList.remove("bf6-path-selected"));
    }

    function addOrToggleMultiSelection(blockId) {
        if (!blockId) return;
        const id = String(blockId);
        if (multiSelectedBlockIds.has(id)) multiSelectedBlockIds.delete(id);
        else multiSelectedBlockIds.add(id);
        paintMultiSelection();
    }

    function getSelectedBlocksByIds(ids) {
        const ws = getMainWorkspace();
        if (!ws) return [];
        const result = [];
        const seen = new Set();
        for (const id of (Array.isArray(ids) ? ids : [])) {
            try {
                let block = ws.getBlockById?.(String(id)) || null;
                if (!block) {
                    const all = ws.getAllBlocks?.(false) || [];
                    block = all.find(b => String(b?.id) === String(id)) || null;
                }
                if (block && !seen.has(String(block.id))) {
                    seen.add(String(block.id));
                    result.push(block);
                }
            } catch (_) {}
        }
        return result;
    }

    // 複数選択コピーでは「選択されたID」をそのままコピー対象にする。
    // 親ブロックが選択されていても、同時に選択された子ブロックを落とさない。
    // これにより、ルールブロック(親)＋その中の子、または子だけを
    // 複数選択した場合でも、選択したものをすべてコピーできる。
    function getCopyRoots(selectedBlocks) {
        const result = [];
        const seen = new Set();
        for (const block of selectedBlocks || []) {
            if (!block || block.id == null) continue;
            const id = String(block.id);
            if (seen.has(id)) continue;
            seen.add(id);
            result.push(block);
        }
        return result;
    }

    function extractBlockForClipboard(block) {
        try {
            const full = _Blockly.serialization.blocks.save(block);
            if (full && full.next) delete full.next;
            return full;
        } catch (_) {
            try {
                if (_Blockly.Xml) {
                    const xml = _Blockly.Xml.blockToDom(block, true);
                    return { _legacyXml: _Blockly.Xml.domToText(xml) };
                }
            } catch (_) {}
            return null;
        }
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

    function extractVariableDefinitions(serializedRoot) {
        const varsById = new Map();
        traverseSerializedBlocks(serializedRoot, b => {
            if (!b.fields?.VAR) return;
            const raw = b.fields.VAR;
            let id = null, name = null, type = "";
            if (raw && typeof raw === "object") {
                id = raw.id || null; name = raw.name || null; type = raw.type || "";
            } else if (typeof raw === "string") name = raw;
            const isObjectVar = !!b.extraState?.isObjectVar;
            if (name) {
                const key = id || name + "::" + type;
                if (!varsById.has(key)) varsById.set(key, { id, name, type, isObjectVar });
            }
        });
        return Array.from(varsById.values());
    }

    function registerVariablesBeforePaste(ws, defs) {
        const varMap = ws?.getVariableMap?.();
        for (const v of defs || []) {
            try {
                let existing = null;
                try { existing = varMap?.getVariable?.(v.id); } catch (_) {}
                if (!existing) try { existing = varMap?.getVariableById?.(v.id); } catch (_) {}
                if (!existing) try { existing = varMap?.getVariableByName?.(v.name); } catch (_) {}
                if (existing) continue;
                if (varMap?.createVariable) {
                    try { varMap.createVariable(v.name, v.type || "", v.id); }
                    catch (_) { try { varMap.createVariable(v.name, v.type || ""); } catch (_) {} }
                } else if (ws?.createVariable) {
                    try { ws.createVariable(v.name, v.type || "", v.id); }
                    catch (_) { try { ws.createVariable(v.name, v.type || ""); } catch (_) {} }
                }
            } catch (_) {}
        }
    }

    function ensureVariableExists(ws, name, type) {
        try {
            const varMap = ws.getVariableMap?.();
            if (!varMap) return null;
            let existing = null;
            try { existing = varMap.getVariable(name); } catch (_) {}
            if (!existing) try { existing = varMap.getVariableByName?.(name); } catch (_) {}
            if (!existing) {
                if (varMap.createVariable) return varMap.createVariable(name, type || "", undefined);
                if (ws.createVariable) return ws.createVariable(name, type || "", undefined);
            }
            return existing;
        } catch (_) { return null; }
    }

    function sanitizeForWorkspace(ws, root) {
        traverseSerializedBlocks(root, b => {
            if (b.type === "variableReferenceBlock" || b.type === "subroutineArgumentBlock") return;
            if (!b.fields) return;
            for (const [key, val] of Object.entries(b.fields)) {
                const ku = key.toUpperCase();
                if (ku === "VAR" || ku === "VARIABLE" || ku.startsWith("VAR")) {
                    const name = val && typeof val === "object" ? val.name : val;
                    if (typeof name === "string" && name) ensureVariableExists(ws, name, val?.type || "");
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
            const existingNames = new Set();
            for (const b of ws.getAllBlocks?.(false) || []) {
                if (b.type === "subroutineBlock") {
                    const name = b.extraState?.subroutineName || b.getField?.("SUBROUTINE_NAME")?.getValue?.();
                    if (name) existingNames.add(name);
                }
            }
            if (!existingNames.has(originalName)) return data;
            let i = 1, newName = originalName + i;
            while (existingNames.has(newName)) newName = originalName + (++i);
            if (data.extraState) data.extraState.subroutineName = newName;
            if (data.fields) data.fields.SUBROUTINE_NAME = newName;
            traverseSerializedBlocks(data, b => {
                if (b.fields?.SUBROUTINE_NAME === originalName) b.fields.SUBROUTINE_NAME = newName;
            });
            return data;
        } catch (_) { return data; }
    }

    function createBlockInstance(ws, data) {
        const defs = extractVariableDefinitions(data);
        if (defs.length) registerVariablesBeforePaste(ws, defs);
        data = renameSubroutineIfNeeded(ws, data);
        data = sanitizeForWorkspace(ws, data);
        const existing = new Set(ws.getAllBlocks?.(false) || []);
        let created = null;
        try {
            if (_Blockly.serialization?.blocks?.append) created = _Blockly.serialization.blocks.append(data, ws);
            else if (data._legacyXml && _Blockly.Xml) created = _Blockly.Xml.domToBlock(_Blockly.Xml.textToDom(data._legacyXml), ws);
        } catch (_) {}
        if (!created) {
            for (const b of ws.getAllBlocks?.(false) || []) {
                if (!existing.has(b) && !b.getParent?.()) { created = b; break; }
            }
        }
        return created;
    }

    function getWorkspaceCoords(ws, e) {
        try {
            let canvas = ws.getCanvas?.() || document.querySelector(".blocklyBlockCanvas");
            if (canvas?.ownerSVGElement?.getScreenCTM) {
                const pt = canvas.ownerSVGElement.createSVGPoint();
                pt.x = e?.clientX || 0; pt.y = e?.clientY || 0;
                const ctm = canvas.getScreenCTM();
                if (ctm?.inverse) {
                    const p = pt.matrixTransform(ctm.inverse());
                    return { x: p.x, y: p.y };
                }
            }
        } catch (_) {}
        const metrics = ws.getMetrics?.() || {};
        return { x: (metrics.viewLeft || 0) + 50, y: (metrics.viewTop || 0) + 50 };
    }

    function autoConnectBlock(createdBlock) {
        if (!createdBlock?.workspace) return;
        const ws = createdBlock.workspace;
        const myConns = [];
        if (createdBlock.outputConnection) myConns.push(createdBlock.outputConnection);
        if (createdBlock.previousConnection) myConns.push(createdBlock.previousConnection);
        const last = createdBlock.lastConnectionInStack?.() || createdBlock;
        if (last?.nextConnection) myConns.push(last.nextConnection);
        if (!myConns.length) return;
        let bestDist = 75, bestMy = null, bestTarget = null;
        for (const other of ws.getAllBlocks?.(false) || []) {
            if (other === createdBlock || other.getRootBlock?.() === createdBlock) continue;
            const targets = [];
            if (other.previousConnection) targets.push(other.previousConnection);
            if (other.nextConnection) targets.push(other.nextConnection);
            for (const input of other.inputList || []) if (input.connection) targets.push(input.connection);
            for (const myC of myConns) for (const tC of targets) {
                let can = true;
                try {
                    if (typeof tC.canConnectWithReason_ === "function") can = tC.canConnectWithReason_(myC) <= 1;
                    else if (typeof tC.isConnectionAllowed === "function") can = tC.isConnectionAllowed(myC);
                } catch (_) { can = false; }
                if (!can) continue;
                const dist = Math.hypot((myC.x || 0) - (tC.x || 0), (myC.y || 0) - (tC.y || 0));
                if (dist < bestDist) { bestDist = dist; bestMy = myC; bestTarget = tC; }
            }
        }
        if (bestMy && bestTarget) {
            try {
                if (bestTarget.type === 1 || bestTarget.type === 3) bestTarget.connect(bestMy);
                else bestMy.connect(bestTarget);
                createdBlock.render?.();
            } catch (_) {}
        }
    }

    async function copyBlocks(fallbackBlock) {
        const ws = getMainWorkspace();
        if (!ws) return;
        const ids = contextSelectedBlockIds.length ? contextSelectedBlockIds :
            (multiSelectedBlockIds.size ? Array.from(multiSelectedBlockIds) : [fallbackBlock?.id].filter(Boolean));
        const selected = getSelectedBlocksByIds(ids);
        const blocks = getCopyRoots(selected.length ? selected : [fallbackBlock].filter(Boolean))
            .map(extractBlockForClipboard).filter(Boolean);
        if (!blocks.length) return;
        const data = blocks.length > 1 ? { _bf6MultiBlockClipboard: 1, blocks } : blocks[0];
        const text = JSON.stringify(data, null, 2);
        clipboardState.lastBlockJson = text;
        await copyTextToClipboard(text);
    }

    async function cutBlocks(fallbackBlock) {
        const ws = getMainWorkspace();
        if (!ws) return;
        const ids = contextSelectedBlockIds.length ? contextSelectedBlockIds :
            (multiSelectedBlockIds.size ? Array.from(multiSelectedBlockIds) : [fallbackBlock?.id].filter(Boolean));
        const selected = getSelectedBlocksByIds(ids);
        const roots = getCopyRoots(selected.length ? selected : [fallbackBlock].filter(Boolean));
        const blocks = roots.map(extractBlockForClipboard).filter(Boolean);
        if (!blocks.length) return;
        const data = blocks.length > 1 ? { _bf6MultiBlockClipboard: 1, blocks } : blocks[0];
        const text = JSON.stringify(data, null, 2);
        clipboardState.lastBlockJson = text;
        await copyTextToClipboard(text);
        // 親子を同時選択しても安全なように、子から先に処理する。
        const disposeOrder = roots.slice().sort((a, b) => {
            const depth = block => {
                let d = 0, p = block?.getParent?.() || null;
                while (p && d < 1000) { d++; p = p.getParent?.() || null; }
                return d;
            };
            return depth(b) - depth(a);
        });
        for (const block of disposeOrder) { try { block.dispose?.(true, true); } catch (_) {} }
        clearMultiSelection();
        ws.resizeContents?.();
    }

    async function pasteBlocks() {
        const ws = getMainWorkspace();
        if (!ws) return;
        const raw = await readTextFromClipboard() || clipboardState.lastBlockJson;
        if (!raw) return;
        let data;
        try { data = JSON.parse(raw); } catch (_) { return; }
        const validBlocks = data?._bf6MultiBlockClipboard === 1 && Array.isArray(data.blocks) ? data.blocks.filter(Boolean) : [data].filter(Boolean);
        if (!validBlocks.length) return;
        // 画面中央ではなく、最後に記録したカーソル位置へ貼り付ける。
        const base = getWorkspaceCoords(ws, {
            clientX: Number(lastCursorClientPoint.x) || 0,
            clientY: Number(lastCursorClientPoint.y) || 0
        });
        const positions = validBlocks.map((d, i) => ({ x: Number.isFinite(Number(d?.x)) ? Number(d.x) : i * 40, y: Number.isFinite(Number(d?.y)) ? Number(d.y) : i * 40 }));
        const minX = Math.min(...positions.map(p => p.x)), minY = Math.min(...positions.map(p => p.y));
        const created = [];
        try {
            _Blockly.Events?.disable?.();
            for (let i = 0; i < validBlocks.length; i++) {
                const b = createBlockInstance(ws, validBlocks[i]);
                if (!b) continue;
                const C = _Blockly.utils?.Coordinate || function(x,y){this.x=x;this.y=y;};
                b.moveTo?.(new C(base.x + positions[i].x - minX, base.y + positions[i].y - minY));
                b.render?.();
                created.push(b);
            }
            if (created.length === 1) autoConnectBlock(created[0]);
            ws.resizeContents?.();
        } finally { _Blockly.Events?.enable?.(); }
        const CreateEvent = _Blockly.Events?.BlockCreate || _Blockly.Events?.Create;
        if (created.length && typeof CreateEvent === "function") {
            for (const b of created) { try { _Blockly.Events.fire(new CreateEvent(b)); } catch (_) {} }
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

        // カーソル位置を常時記録。Ctrl/Cmd+V やメニューからの貼り付けでも
        // 最後にマウスがあった場所へ貼り付けられるようにする。
        window.addEventListener("pointermove", e => {
            if (typeof e.clientX === "number" && typeof e.clientY === "number") {
                lastCursorClientPoint = { x: e.clientX, y: e.clientY };
            }
        }, true);
        window.addEventListener("pointerdown", e => {
            if (typeof e.clientX === "number" && typeof e.clientY === "number") {
                lastCursorClientPoint = { x: e.clientX, y: e.clientY };
            }
        }, true);

        // ★ 重要: Shift+クリックは pointerdown の1回だけで処理する。
        // click側で再度toggleすると、1クリックで追加→解除されてしまう。
        window.addEventListener("pointerdown", e => {
            if (e.button !== 0 || !e.shiftKey) return;
            const id = getBlockIdFromEvent(e);
            if (!id) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            addOrToggleMultiSelection(id);
        }, true);

        // Shift+クリックから発生するclickをBlocklyへ渡さない。
        // ただしここでは選択状態を変更しない。
        window.addEventListener("click", e => {
            if (e.button !== 0 || !e.shiftKey) return;
            if (!getBlockIdFromEvent(e)) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
        }, true);

        // Shiftなしの通常クリックは独自の複数選択を解除するだけ。
        window.addEventListener("pointerdown", e => {
            if (e.button !== 0 || e.shiftKey) return;
            const target = e.target;
            if (target?.closest?.(".blocklyWidgetDiv, .blocklyContextMenu, .blocklyDropDownDiv")) return;
            if (multiSelectedBlockIds.size) clearMultiSelection();
        }, true);

        document.addEventListener("contextmenu", e => {
            if (typeof e.clientX === "number" && typeof e.clientY === "number") {
                lastCursorClientPoint = { x: e.clientX, y: e.clientY };
            }
            const id = getBlockIdFromEvent(e);
            if (id && !multiSelectedBlockIds.has(String(id))) {
                multiSelectedBlockIds.clear();
                multiSelectedBlockIds.add(String(id));
                paintMultiSelection();
            }
            contextSelectedBlockIds = Array.from(multiSelectedBlockIds);
        }, true);

        new MutationObserver(() => {
            if (multiSelectedBlockIds.size) paintMultiSelection();
        }).observe(document.body || document.documentElement, { childList:true, subtree:true });
    }

    function registerClipboardMenus() {
        if (clipboardMenusRegistered) return;
        clipboardMenusRegistered = true;
        installMultiSelection();
        const Scope = _Blockly.ContextMenuRegistry.ScopeType;
        const items = [
            {
                id: "blockUtilityCopyBlock",
                displayText: () => getPortalLanguage() === "ja" ? "コピー" : "Copy",
                scopeType: Scope.BLOCK,
                weight: 110,
                preconditionFn: s => s?.block ? "enabled" : "hidden",
                callback: s => copyBlocks(s.block).catch(e => BF2042Portal.Shared?.logError?.("BlockUtility copy", String(e)))
            },
            {
                id: "blockUtilityCutBlock",
                displayText: () => getPortalLanguage() === "ja" ? "切り取り" : "Cut",
                scopeType: Scope.BLOCK,
                weight: 109,
                preconditionFn: s => s?.block ? "enabled" : "hidden",
                callback: s => cutBlocks(s.block).catch(e => BF2042Portal.Shared?.logError?.("BlockUtility cut", String(e)))
            },
            {
                id: "blockUtilityPasteBlock",
                displayText: () => getPortalLanguage() === "ja" ? "貼り付け" : "Paste",
                scopeType: Scope.WORKSPACE,
                weight: 110,
                preconditionFn: () => "enabled",
                callback: () => pasteBlocks().catch(e => BF2042Portal.Shared?.logError?.("BlockUtility paste", String(e)))
            }
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
