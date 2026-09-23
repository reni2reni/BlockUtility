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
    // Copy / Cut / Paste + Shift multi-selection (migrated from ExperienceManager)
    // ================================================================
    const copyState = {
        selectedIds: new Set(),
        contextIds: [],
        clipboard: null,
        lastMouse: null,
        lastContext: null,
        initialized: false
    };

    function getWorkspace() {
        try { return _Blockly.getMainWorkspace && _Blockly.getMainWorkspace(); } catch (_) { return null; }
    }

    function getBlockFromElement(target) {
        try {
            let el = target;
            for (let i = 0; el && i < 14; i++, el = el.parentElement || el.parentNode) {
                const id = el.getAttribute?.("data-id") || el.dataset?.id;
                if (id) {
                    const ws = getWorkspace();
                    const block = ws?.getBlockById?.(String(id));
                    if (block) return block;
                }
            }
        } catch (_) {}
        return null;
    }

    function getBlockIdFromEvent(e) {
        const block = getBlockFromElement(e?.target);
        return block ? String(block.id) : null;
    }

    function getSelectedIdsForAction(blockId) {
        if (copyState.contextIds.length) return copyState.contextIds.slice();
        if (copyState.selectedIds.size) return Array.from(copyState.selectedIds);
        return blockId ? [String(blockId)] : [];
    }

    function getBlockSvgPath(block) {
        try {
            const root = block?.getSvgRoot?.();
            if (!root) return null;
            for (const child of root.children || []) {
                if (child.tagName?.toLowerCase() === "path" && child.classList?.contains("blocklyPath")) return child;
            }
        } catch (_) {}
        return null;
    }

    function ensureSelectionStyle() {
        if (document.getElementById("bf6-blockutility-multi-select-style")) return;
        const style = document.createElement("style");
        style.id = "bf6-blockutility-multi-select-style";
        style.textContent = `path.bf6-blockutility-selected { stroke:#66ccff !important; stroke-width:3px !important; filter:brightness(1.18); }`;
        document.head?.appendChild(style);
    }

    function paintSelection() {
        ensureSelectionStyle();
        document.querySelectorAll(".bf6-blockutility-selected").forEach(el => el.classList.remove("bf6-blockutility-selected"));
        const ws = getWorkspace();
        for (const id of copyState.selectedIds) {
            const block = ws?.getBlockById?.(String(id));
            const path = getBlockSvgPath(block);
            if (path) path.classList.add("bf6-blockutility-selected");
        }
        try {
            window.dispatchEvent(new CustomEvent("bf6-blockutility-selection-changed", {
                detail: { ids: Array.from(copyState.selectedIds) }
            }));
        } catch (_) {}
    }

    function clearSelection() {
        copyState.selectedIds.clear();
        copyState.contextIds = [];
        paintSelection();
    }

    function toggleSelection(blockId) {
        if (!blockId) return;
        const id = String(blockId);
        if (copyState.selectedIds.has(id)) copyState.selectedIds.delete(id);
        else copyState.selectedIds.add(id);
        paintSelection();
    }

    function getBlockPosition(block) {
        try {
            const p = block.getRelativeToSurfaceXY?.();
            if (p) return { x:Number(p.x)||0, y:Number(p.y)||0 };
        } catch (_) {}
        return { x:0, y:0 };
    }

    function getBlockSize(block) {
        try {
            const r = block.getBoundingRectangle?.();
            if (r) return { w:Number(r.getWidth?.() ?? r.width)||0, h:Number(r.getHeight?.() ?? r.height)||0 };
        } catch (_) {}
        return { w:0, h:0 };
    }

    function traverseSerializedBlocks(node, cb) {
        if (!node) return;
        cb(node);
        if (node.inputs) for (const input of Object.values(node.inputs)) {
            if (input?.block) traverseSerializedBlocks(input.block, cb);
            if (input?.shadow) traverseSerializedBlocks(input.shadow, cb);
        }
        if (node.next?.block) traverseSerializedBlocks(node.next.block, cb);
    }

    function extractVariableDefinitions(root) {
        const out = new Map();
        traverseSerializedBlocks(root, b => {
            const raw = b?.fields?.VAR;
            if (raw == null) return;
            const id = typeof raw === "object" ? raw.id || null : null;
            const name = typeof raw === "object" ? raw.name || null : String(raw);
            const type = typeof raw === "object" ? raw.type || "" : "";
            if (name) out.set(id || name + "::" + type, {id,name,type});
        });
        return [...out.values()];
    }

    function registerVariables(ws, defs) {
        try {
            const vm = ws.getVariableMap?.();
            for (const v of defs) {
                let existing = null;
                try { existing = vm?.getVariable?.(v.id) || vm?.getVariableById?.(v.id) || vm?.getVariableByName?.(v.name); } catch (_) {}
                if (existing) continue;
                try { vm?.createVariable?.(v.name, v.type || "", v.id); } catch (_) {
                    try { ws.createVariable?.(v.name, v.type || "", v.id); } catch (_) {}
                }
            }
        } catch (_) {}
    }

    function ensureVariables(ws, root) {
        registerVariables(ws, extractVariableDefinitions(root));
        return root;
    }

    function renameSubroutineIfNeeded(ws, data) {
        try {
            if (data?.type !== "subroutineBlock") return data;
            const original = data.extraState?.subroutineName || data.fields?.SUBROUTINE_NAME;
            if (!original) return data;
            const names = new Set((ws.getAllBlocks?.(false)||[]).filter(b=>b.type==="subroutineBlock").map(b => b.extraState?.subroutineName || b.getField?.("SUBROUTINE_NAME")?.getValue()).filter(Boolean));
            if (!names.has(original)) return data;
            let i=1, next=original+i; while(names.has(next)) next=original+(++i);
            if (data.extraState) data.extraState.subroutineName=next;
            if (data.fields?.SUBROUTINE_NAME) data.fields.SUBROUTINE_NAME=next;
            traverseSerializedBlocks(data,b=>{ if(b.fields?.SUBROUTINE_NAME===original)b.fields.SUBROUTINE_NAME=next; });
        } catch (_) {}
        return data;
    }

    function createBlock(ws, data) {
        try {
            ensureVariables(ws, data);
            renameSubroutineIfNeeded(ws, data);
            const before = new Set(ws.getAllBlocks?.(false)||[]);
            let b = _Blockly.serialization?.blocks?.append ? _Blockly.serialization.blocks.append(data, ws) : null;
            if (!b) for (const x of ws.getAllBlocks?.(false)||[]) if (!before.has(x) && !x.getParent?.()) { b=x; break; }
            return b || null;
        } catch (_) { return null; }
    }

    function workspacePoint(clientX, clientY) {
        const ws = getWorkspace();
        if (!ws) return {x:0,y:0};
        try {
            const svg = ws.getParentSvg?.() || ws.getSvg?.();
            const rect = svg?.getBoundingClientRect?.();
            const scale = Number(ws.getScale?.() || 1);
            if (rect) return { x:(clientX-rect.left)/scale, y:(clientY-rect.top)/scale };
        } catch (_) {}
        try {
            const canvas = ws.getCanvas?.();
            const svg = canvas?.ownerSVGElement;
            if (svg?.getScreenCTM) { const pt=svg.createSVGPoint(); pt.x=clientX; pt.y=clientY; const p=pt.matrixTransform(svg.getScreenCTM().inverse()); return {x:p.x,y:p.y}; }
        } catch (_) {}
        return {x:clientX,y:clientY};
    }

    function saveSelectedClipboard(ids) {
        const ws = getWorkspace();
        if (!ws) return null;
        const selected = [];
        for (const id of ids) { const b=ws.getBlockById?.(String(id)); if(b) selected.push(b); }
        if (!selected.length) return null;
        const selectedSet = new Set(selected);
        const items = [];
        for (const b of selected) {
            let data = null;
            try { data = _Blockly.serialization.blocks.save(b); } catch (_) {}
            if (!data) continue;
            if (data.next) delete data.next;
            const pos=getBlockPosition(b), size=getBlockSize(b);
            const prev=b.previousConnection?.targetBlock?.();
            const next=b.nextConnection?.targetBlock?.();
            items.push({
                data,
                id:String(b.id), x:pos.x, y:pos.y, w:size.w, h:size.h,
                previousId: prev && selectedSet.has(prev) ? String(prev.id) : null,
                nextId: next && selectedSet.has(next) ? String(next.id) : null
            });
        }
        if (!items.length) return null;
        const payload={_bf6BlockUtilityClipboard:1,items};
        copyState.clipboard=payload;
        try { localStorage.setItem("bf6-blockutility-clipboard", JSON.stringify(payload)); } catch (_) {}
        try { navigator.clipboard?.writeText?.(JSON.stringify(payload)); } catch (_) {}
        return payload;
    }

    function loadClipboard(raw) {
        if (raw) { try { const d=JSON.parse(raw); if(d?._bf6BlockUtilityClipboard)return d; } catch (_) {} }
        if (copyState.clipboard) return copyState.clipboard;
        try { const d=JSON.parse(localStorage.getItem("bf6-blockutility-clipboard")||""); if(d?._bf6BlockUtilityClipboard)return d; } catch (_) {}
        return null;
    }

    function connectIfAligned(a,b) {
        if (!a || !b) return false;
        try {
            const ac=a.nextConnection, bc=b.previousConnection;
            if (!ac || !bc) return false;
            const ap=getBlockPosition(a), bp=getBlockPosition(b), as=getBlockSize(a);
            // 真下に並ぶ場合だけ接続対象。横ズレは接続しない。
            const dx=Math.abs(ap.x-bp.x);
            const dy=Math.abs((ap.y+as.h)-bp.y);
            if (dx>6 || dy>18) return false;
            if (ac.isConnectionAllowed && !ac.isConnectionAllowed(bc)) return false;
            ac.connect(bc); return true;
        } catch (_) { return false; }
    }

    function pastePayload(payload, clientX, clientY) {
        const ws=getWorkspace(); if(!ws||!payload?.items?.length)return [];
        const base=workspacePoint(clientX,clientY);
        const items=payload.items.slice();
        const connected=new Set();
        for(const i of items){ if(i.previousId||i.nextId) connected.add(i.id); }
        const positions=items.map(i=>({x:Number(i.x)||0,y:Number(i.y)||0}));
        const minX=Math.min(...positions.map(p=>p.x)), minY=Math.min(...positions.map(p=>p.y));
        const map=new Map(), created=[];
        const isConnectedGroup=connected.size>0;
        // 独立ブロックは従来どおり少し右下へまとめて配置。
        // 連結ブロックは一旦同じ基準へ置き、下方向へ整列してから接続する。
        for(let n=0;n<items.length;n++){
            const item=items[n];
            const data=JSON.parse(JSON.stringify(item.data));
            const b=createBlock(ws,data); if(!b)continue;
            map.set(item.id,b); created.push(b);
            const Coordinate=_Blockly.utils?.Coordinate || function(x,y){this.x=x;this.y=y;};
            let x,y;
            if(isConnectedGroup){ x=base.x; y=base.y; }
            else { x=base.x+32+(Number(item.x)||0)-minX; y=base.y+32+(Number(item.y)||0)-minY; }
            try { b.moveTo?.(new Coordinate(x,y)); b.render?.(); } catch (_) {}
        }
        if(isConnectedGroup){
            // 選択された連結チェーンごとに、真下へ整列。接続は明示的に行う。
            const roots=items.filter(i=>i.previousId==null);
            for(const root of roots){
                let cur=root, y=base.y, guard=0;
                while(cur && guard++<items.length){
                    const b=map.get(cur.id); if(!b)break;
                    const Coordinate=_Blockly.utils?.Coordinate || function(x,y){this.x=x;this.y=y;};
                    try { b.moveTo?.(new Coordinate(base.x,y)); b.render?.(); } catch (_) {}
                    const size=getBlockSize(b); const nextItem=items.find(x=>x.id===cur.nextId);
                    if(!nextItem)break;
                    y+=Math.max(size.h,1);
                    cur=nextItem;
                }
            }
            for(const item of items){ if(item.nextId){ const a=map.get(item.id), b=map.get(item.nextId); if(a&&b) connectIfAligned(a,b); } }
        }
        try { ws.resizeContents?.(); } catch (_) {}
        return created;
    }

    function copyAction(ids){ saveSelectedClipboard(ids); }
    function cutAction(ids){
        const ws=getWorkspace(); const payload=saveSelectedClipboard(ids); if(!ws||!payload)return;
        const selected=ids.map(id=>ws.getBlockById?.(String(id))).filter(Boolean);
        // 親子を含めて選択されたものをすべて処理。子が親シリアライズに含まれていても、選択対象そのものは除外しない。
        for(const b of selected){ try{ b.dispose(true,true); }catch(_){} }
        paintSelection();
    }

    function handleAction(detail){
        const action=detail?.action;
        if(!["copy-block","cut-block","paste-block"].includes(action))return;
        const ws=getWorkspace(); if(!ws)return;
        if(action==="copy-block"||action==="cut-block"){
            const ids=Array.isArray(detail.selectedBlockIds)&&detail.selectedBlockIds.length?detail.selectedBlockIds:getSelectedIdsForAction(detail.blockId);
            if(action==="copy-block")copyAction(ids); else cutAction(ids);
            return;
        }
        const raw=detail.clipboardText||null, payload=loadClipboard(raw);
        if(payload){ const m=detail.x!=null?detail.x:(copyState.lastContext?.x||copyState.lastMouse?.x||0); const n=detail.y!=null?detail.y:(copyState.lastContext?.y||copyState.lastMouse?.y||0); pastePayload(payload,m,n); }
    }

    function installCopyPaste(){
        if(copyState.initialized)return;
        copyState.initialized=true;
        ensureSelectionStyle();
        window.addEventListener("mousemove",e=>{copyState.lastMouse={x:e.clientX,y:e.clientY};},true);
        window.addEventListener("contextmenu",e=>{
            const b=getBlockFromElement(e.target); const id=b&&String(b.id);
            if(id && !copyState.selectedIds.has(id)) { copyState.selectedIds.clear(); copyState.selectedIds.add(id); paintSelection(); }
            copyState.contextIds=Array.from(copyState.selectedIds);
            copyState.lastContext={x:e.clientX,y:e.clientY};
            try{window.dispatchEvent(new CustomEvent("bf6-blockutility-context",{detail:{ids:copyState.contextIds.slice(),blockId:id,x:e.clientX,y:e.clientY}}));}catch(_){}
        },true);
        window.addEventListener("pointerdown",e=>{
            if(e.button!==0)return;
            if(e.shiftKey){ const id=getBlockIdFromEvent(e); if(id){ e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();toggleSelection(id); } }
            else { const onMenu=e.target?.closest?.(".blocklyContextMenu,.bf2042-portal-custom-menu,.bf6-experience-manager-options-submenu"); if(!onMenu){copyState.selectedIds.clear();copyState.contextIds=[];paintSelection();} }
        },true);
        window.addEventListener("click",e=>{ if(e.shiftKey&&getBlockIdFromEvent(e)){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}},true);
        window.addEventListener("keydown",async e=>{
            const tag=(e.target?.tagName||"").toLowerCase(); if(tag==="input"||tag==="textarea")return;
            const mod=e.ctrlKey||e.metaKey; if(!mod)return;
            const key=String(e.key||"").toLowerCase();
            if(key==="c"){
                const ids=copyState.selectedIds.size?Array.from(copyState.selectedIds):(()=>{const s=getWorkspace()?.getSelected?.();return s?(Array.isArray(s)?s:[s]).map(b=>b.id):[]})();
                if(ids.length){e.preventDefault();e.stopImmediatePropagation();copyAction(ids);}
            } else if(key==="p"){
                if(copyState.clipboard||loadClipboard()){e.preventDefault();e.stopImmediatePropagation(); const m=copyState.lastMouse?.x||0,n=copyState.lastMouse?.y||0; pastePayload(loadClipboard(),m,n);}
            } else if(key==="v"){
                // プラグインのJSONクリップボードを優先。外部テキストがある場合は通常ペーストとして受ける。
                let raw=null; try{raw=await navigator.clipboard?.readText?.();}catch(_){}
                const payload=loadClipboard(raw); if(payload){e.preventDefault();e.stopImmediatePropagation(); const m=copyState.lastMouse?.x||0,n=copyState.lastMouse?.y||0; pastePayload(payload,m,n);}
            }
        },true);
        window.addEventListener("bf6-experience-manager-action",e=>handleAction(e.detail),true);
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
        try { installCopyPaste(); registerMenus(); }
        catch (e) {
            if (BF2042Portal.Shared && typeof BF2042Portal.Shared.logError === "function") {
                BF2042Portal.Shared.logError("BlockUtility menu registration", String(e));
            }
        }
    };
})();
