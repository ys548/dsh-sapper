window.__ModuleLoader__.load({
	id: "dsh-sapper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/useSapperGraph.ts
		/**
		* Poll the Host graph route for the current engagement graph.
		*
		* The Host resolves which store to read (explicit override, then any registered
		* workspace that already holds one, then its own directory), so the browser
		* does not need to know the folder layout.
		*/
		/** Route registered by this package's Host half. */
		const GRAPH_ROUTE = "/api/sapper/graph";
		/** Poll cadence: the graph changes at human pace, not frame pace. */
		const POLL_MS = 4e3;
		/**
		* Subscribe to one engagement graph.
		* @param paused - when true, keep the last graph and stop polling.
		* @param cwd - store directory to read; null asks the Host to pick one.
		* @returns the latest graph, the target list, and loading and error state.
		*/
		function useSapperGraph(paused = false, cwd = null) {
			const [state, setState] = (0, react.useState)({
				graph: null,
				targets: [],
				loading: true,
				error: null,
				store: null
			});
			(0, react.useEffect)(() => {
				let cancelled = false;
				const route = cwd === null || cwd.length === 0 ? GRAPH_ROUTE : `${GRAPH_ROUTE}?cwd=${encodeURIComponent(cwd)}`;
				const read = async () => {
					try {
						const response = await fetch(route, { headers: { accept: "application/json" } });
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const payload = await response.json();
						if (cancelled) return;
						setState({
							graph: payload.graph ?? null,
							targets: payload.targets ?? [],
							loading: false,
							error: null,
							store: payload.store ?? null
						});
					} catch (error) {
						if (cancelled) return;
						setState((previous) => ({
							graph: previous.graph,
							targets: previous.targets,
							loading: false,
							error: error instanceof Error ? error.message : String(error),
							store: previous.store
						}));
					}
				};
				read();
				if (paused) return () => {
					cancelled = true;
				};
				const timer = setInterval(() => {
					read();
				}, POLL_MS);
				return () => {
					cancelled = true;
					clearInterval(timer);
				};
			}, [paused, cwd]);
			return state;
		}
		//#endregion
		//#region src/client/SapperBoard.tsx
		const CANVAS_BG = "var(--dsw-alias-bg-base)";
		const GRID_DOT = "var(--dsw-alias-label-caption)";
		const CARD_BG = "var(--dsw-alias-bg-layer-2)";
		const CARD_BG_HOVER = "var(--dsw-alias-bg-layer-3)";
		const CARD_BORDER = "var(--dsw-alias-border-l2)";
		const LABEL = "var(--dsw-alias-label-primary)";
		const MUTED = "var(--dsw-alias-label-secondary)";
		const FAINT = "var(--dsw-alias-label-tertiary)";
		const VALUE = "var(--dsw-static-deepseek-400)";
		const GOLD = "var(--dsw-static-amber-500)";
		const TEAL = "var(--dsw-static-green-400)";
		const BLUE = "var(--dsw-static-deepseek-450)";
		const LIVE = "var(--dsw-static-green-400)";
		const EDGE = "var(--dsw-static-deepseek-400)";
		const CARD_W = 214;
		const CARD_MIN_H = 86;
		const GAP_Y = 18;
		const PAD_X = 48;
		const PAD_Y = 40;
		const MAX_PER_COLUMN = 5;
		const TYPE = {
			asset: {
				label: "资产",
				color: "var(--dsw-static-deepseek-450)"
			},
			finding: {
				label: "成果",
				color: "var(--dsw-static-green-400)"
			},
			clue: {
				label: "线索",
				color: "var(--dsw-static-amber-500)"
			},
			objective: {
				label: "目标物",
				color: "var(--dsw-static-deepseek-300)"
			},
			intent: {
				label: "意图",
				color: "var(--dsw-static-deepseek-400)"
			}
		};
		const STATUS_LABEL = {
			tested: "已验证",
			blocked: "受阻",
			open: "待办",
			claimed: "执行中",
			pending: "待处理",
			done: "已完成",
			abandoned: "已放弃",
			confirmed: "已确认"
		};
		const STATUS_COLOR = {
			tested: TEAL,
			blocked: GOLD,
			open: BLUE,
			claimed: GOLD,
			pending: FAINT,
			done: TEAL,
			abandoned: FAINT,
			confirmed: TEAL
		};
		/** Approximate rendered width in em units; CJK counts 1, ASCII 0.55. */
		function measure(text) {
			let width = 0;
			for (const char of text) width += /[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 1 : .55;
			return width;
		}
		/**
		* Wrap text by measured width rather than character count.
		* @param value - text to wrap.
		* @param maxUnits - usable width in em units.
		* @param maxLines - hard line cap; the last line is ellipsized when cut.
		* @returns wrapped lines.
		*/
		function wrap(value, maxUnits, maxLines) {
			const chars = [...value];
			const lines = [];
			let current = "";
			let width = 0;
			for (const char of chars) {
				const unit = measure(char);
				if (width + unit > maxUnits && current.length > 0) {
					lines.push(current);
					if (lines.length === maxLines) break;
					current = "";
					width = 0;
				}
				current += char;
				width += unit;
			}
			if (lines.length < maxLines && current.length > 0) lines.push(current);
			if (lines.join("").length < chars.length && lines.length > 0) {
				const last = [...lines[lines.length - 1] ?? ""];
				while (last.length > 1 && measure(last.join("")) > maxUnits - 1) last.pop();
				lines[lines.length - 1] = `${last.join("")}…`;
			}
			return lines.length > 0 ? lines : [""];
		}
		/**
		* Classify a fact into a board type.
		* @param fact - the fact to classify.
		* @returns its board type.
		*/
		function factType(fact) {
			if (fact.id === "goal") return "objective";
			switch (fact.kind) {
				case "host":
				case "service":
				case "cred": return "asset";
				case "vuln":
				case "loot": return "finding";
				case "flag": return "objective";
				default: return "clue";
			}
		}
		/**
		* Project a fact's structured data onto the rows worth showing.
		* @param fact - the fact whose data is projected.
		* @returns up to three rows.
		*/
		function factRows(fact) {
			const data = fact.data ?? {};
			const str = (key) => {
				const value = data[key];
				return typeof value === "string" || typeof value === "number" ? String(value) : null;
			};
			const rows = [];
			const host = str("host") ?? str("ip");
			const port = str("port");
			if (host !== null) rows.push({
				label: "地址",
				value: port !== null ? `${host}:${port}` : host
			});
			const product = str("product") ?? str("framework");
			if (product !== null) rows.push({
				label: "指纹",
				value: product
			});
			const cve = str("cve");
			if (cve !== null) rows.push({
				label: "CVE",
				value: cve
			});
			const entry = str("entry");
			if (entry !== null && rows.length < 2) rows.push({
				label: "入口",
				value: entry
			});
			const url = str("url");
			if (url !== null && rows.length < 2) rows.push({
				label: "位置",
				value: url
			});
			const waf = str("waf");
			if (waf !== null && rows.length < 3) rows.push({
				label: "防护",
				value: waf
			});
			const org = str("org");
			if (org !== null && rows.length < 2) rows.push({
				label: "归属",
				value: org
			});
			if (rows.length === 0) {
				const gist = fact.description?.trim() ?? "";
				if (gist !== "") rows.push({
					label: "内容",
					value: gist
				});
			}
			return rows.slice(0, 3);
		}
		const EMPTY_BOARD = {
			cards: [],
			byId: /* @__PURE__ */ new Map(),
			edges: [],
			width: 0,
			height: 0
		};
		/**
		* Dependency rank per fact: one past the deepest chain producing it.
		* @param facts - graph facts.
		* @param intents - graph intents.
		* @returns rank per fact id.
		*/
		function factRanks(facts, intents) {
			const known = new Set(facts.map((f) => f.id));
			const rank = new Map(facts.map((f) => [f.id, 0]));
			let changed = true;
			let guard = 0;
			while (changed && guard++ <= facts.length + 5) {
				changed = false;
				for (const intent of intents) {
					if (!intent.to || !known.has(intent.to)) continue;
					const deepest = (intent.from ?? []).reduce((max, id) => Math.max(max, rank.get(id) ?? 0), -1);
					if ((rank.get(intent.to) ?? 0) < deepest + 1) {
						rank.set(intent.to, deepest + 1);
						changed = true;
					}
				}
			}
			return rank;
		}
		/**
		* Build the board: interleave fact and intent columns by dependency rank.
		* @param facts - graph facts.
		* @param intents - graph intents.
		* @returns the laid-out board.
		*/
		function buildBoard(facts, intents) {
			if (facts.length === 0 && intents.length === 0) return EMPTY_BOARD;
			const titles = new Map(facts.map((fact) => [fact.id, fact.title?.trim() || fact.id]));
			const ranks = factRanks(facts, intents);
			const intentRanks = /* @__PURE__ */ new Map();
			for (const intent of intents) {
				const deepest = (intent.from ?? []).reduce((max, id) => Math.max(max, ranks.get(id) ?? 0), 0);
				intentRanks.set(intent.id, deepest);
			}
			const slotMap = /* @__PURE__ */ new Map();
			const slotOf = (index) => {
				const existing = slotMap.get(index);
				if (existing) return existing;
				const created = {
					facts: [],
					intents: []
				};
				slotMap.set(index, created);
				return created;
			};
			for (const fact of facts) slotOf((ranks.get(fact.id) ?? 0) * 2).facts.push(fact);
			for (const intent of intents) slotOf((intentRanks.get(intent.id) ?? 0) * 2 + 1).intents.push(intent);
			const columns = [];
			for (const index of [...slotMap.keys()].sort((a, b) => a - b)) {
				const slot = slotMap.get(index) ?? {
					facts: [],
					intents: []
				};
				const items = [...slot.facts.slice().sort((a, b) => a.id.localeCompare(b.id, void 0, { numeric: true })).map((value) => ({
					kind: "fact",
					value
				})), ...slot.intents.slice().sort((a, b) => a.id.localeCompare(b.id, void 0, { numeric: true })).map((value) => ({
					kind: "intent",
					value
				}))];
				for (let start = 0; start < items.length; start += MAX_PER_COLUMN) {
					const chunk = items.slice(start, start + MAX_PER_COLUMN);
					columns.push({
						facts: chunk.filter((item) => item.kind === "fact").map((item) => item.value),
						intents: chunk.filter((item) => item.kind === "intent").map((item) => item.value)
					});
				}
			}
			const cards = [];
			const byId = /* @__PURE__ */ new Map();
			const columnHeights = [];
			const titleUnits = (CARD_W - 28) / 12.5;
			const rowUnits = (CARD_W - 64) / 10.5;
			columns.forEach((column, columnIndex) => {
				let y = PAD_Y;
				const entries = [...column.facts.map((fact) => ({
					kind: "fact",
					fact
				})), ...column.intents.map((intent) => ({
					kind: "intent",
					intent
				}))];
				for (const entry of entries) {
					let type;
					let badge;
					let titleSource;
					let rows;
					let status;
					if (entry.kind === "fact") {
						const fact = entry.fact;
						type = factType(fact);
						badge = TYPE[type].label;
						titleSource = fact.title?.trim() || fact.description?.trim() || fact.id;
						rows = factRows(fact);
						status = typeof fact.data?.status === "string" ? fact.data.status : null;
					} else {
						const intent = entry.intent;
						type = "intent";
						const open = intent.to === null || intent.to === void 0;
						badge = TYPE.intent.label;
						titleSource = intent.title?.trim() || intent.description?.trim() || intent.id;
						const from = intent.from ?? [];
						rows = [{
							label: "来源",
							value: from.length > 0 ? from.map((id) => titles.get(id) ?? id).join("、") : "—"
						}];
						if (intent.worker) rows.push({
							label: "执行",
							value: intent.worker
						});
						status = intent.status ?? (open ? "open" : "done");
					}
					const titleRows = wrap(titleSource, titleUnits, 2);
					const displayRows = rows.map((row) => ({
						label: row.label,
						value: wrap(row.value, rowUnits, 1)[0] ?? ""
					}));
					let cursor = 20;
					const chipY = cursor;
					cursor += 16;
					const titleYs = titleRows.map((_, index) => cursor + index * 17);
					cursor += titleRows.length * 17 + 8;
					const rowYs = displayRows.map((_, index) => cursor + index * 15);
					cursor += displayRows.length * 15;
					const statusY = status !== null ? cursor + 14 : null;
					const height = Math.max(CARD_MIN_H, (statusY ?? cursor) + 12);
					const card = {
						id: entry.kind === "fact" ? entry.fact.id : entry.intent.id,
						kind: entry.kind,
						...entry.kind === "fact" ? { fact: entry.fact } : { intent: entry.intent },
						type,
						badge,
						titleRows,
						rows: displayRows,
						status,
						x: PAD_X + columnIndex * 362,
						y,
						height,
						column: columnIndex,
						chipY,
						titleYs,
						rowYs,
						statusY
					};
					cards.push(card);
					byId.set(card.id, card);
					y += height + GAP_Y;
				}
				columnHeights.push(y);
			});
			const edges = [];
			for (const intent of intents) {
				if (!byId.has(intent.id)) continue;
				const open = intent.to === null || intent.to === void 0;
				for (const fromId of intent.from ?? []) {
					if (!byId.has(fromId)) continue;
					edges.push({
						from: fromId,
						to: intent.id,
						color: EDGE,
						dashed: open
					});
				}
				if (intent.to && byId.has(intent.to)) edges.push({
					from: intent.id,
					to: intent.to,
					color: EDGE,
					dashed: false
				});
			}
			const tallest = Math.max(1, ...columnHeights);
			const height = Math.max(460, tallest + 24);
			return {
				cards,
				byId,
				edges,
				width: PAD_X * 2 + Math.max(0, columns.length - 1) * 362 + CARD_W,
				height
			};
		}
		function tallyOf(facts, intents) {
			const tally = {
				asset: 0,
				finding: 0,
				cred: 0,
				clue: 0,
				objective: 0,
				intent: intents.length,
				open: 0,
				done: 0
			};
			for (const fact of facts) switch (fact.kind) {
				case "host":
				case "service":
					tally.asset += 1;
					break;
				case "cred":
					tally.cred += 1;
					break;
				case "vuln":
				case "loot":
					tally.finding += 1;
					break;
				case "flag":
					tally.objective += 1;
					break;
				default: tally.clue += 1;
			}
			for (const intent of intents) if (intent.status === "done") tally.done += 1;
			else tally.open += 1;
			return tally;
		}
		function downloadGraph(graph) {
			const blob = new Blob([JSON.stringify(graph, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = "sapper-graph.json";
			link.click();
			URL.revokeObjectURL(url);
		}
		const rootStyle = {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			width: "100%",
			minHeight: 0,
			minWidth: 0,
			overflow: "hidden",
			background: CANVAS_BG,
			color: LABEL,
			fontSize: 13,
			fontFamily: "var(--dsw-font-family), ui-sans-serif, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
		};
		const toolbarStyle = {
			display: "flex",
			alignItems: "center",
			gap: 2,
			height: 46,
			padding: "0 14px",
			borderBottom: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-layer-1)",
			flexShrink: 0,
			minWidth: 0,
			overflow: "hidden",
			position: "relative",
			zIndex: 4
		};
		const textBtnStyle = {
			border: "none",
			background: "transparent",
			color: LABEL,
			fontSize: 13,
			lineHeight: 1,
			padding: "6px 8px",
			borderRadius: 6,
			cursor: "pointer",
			fontFamily: "inherit",
			whiteSpace: "nowrap"
		};
		const menuStyle = {
			position: "absolute",
			top: "calc(100% + 6px)",
			left: 0,
			zIndex: 6,
			minWidth: 220,
			maxWidth: 360,
			maxHeight: 280,
			overflow: "auto",
			padding: 6,
			borderRadius: 10,
			background: "var(--dsw-alias-bg-layer-3)",
			border: "1px solid var(--dsw-alias-border-l2)",
			boxShadow: "0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)"
		};
		const floatStyle = {
			position: "absolute",
			top: 14,
			right: 14,
			width: 292,
			borderRadius: 12,
			background: "var(--dsw-alias-bg-layer-2)",
			border: "1px solid var(--dsw-alias-border-l2)",
			boxShadow: "0 12px 40px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)",
			zIndex: 3,
			overflow: "hidden"
		};
		/**
		* The collaboration board.
		* @returns the board UI.
		*/
		function SapperBoard() {
			const [paused, setPaused] = (0, react.useState)(false);
			const [cwd, setCwd] = (0, react.useState)(null);
			const { graph, loading, error, targets, store } = useSapperGraph(paused, cwd);
			const [selected, setSelected] = (0, react.useState)(null);
			const [hovered, setHovered] = (0, react.useState)(null);
			const [assetsOnly, setAssetsOnly] = (0, react.useState)(false);
			const [menu, setMenu] = (0, react.useState)(null);
			const [agentsOpen, setAgentsOpen] = (0, react.useState)(true);
			const [view, setView] = (0, react.useState)(null);
			const drag = (0, react.useRef)(null);
			const svgRef = (0, react.useRef)(null);
			const barRef = (0, react.useRef)(null);
			const viewGraph = (0, react.useMemo)(() => {
				if (!graph) return null;
				if (!assetsOnly) return graph;
				const facts = graph.facts.filter((fact) => factType(fact) === "asset");
				const ids = new Set(facts.map((fact) => fact.id));
				const intents = graph.intents.filter((intent) => (intent.from ?? []).some((id) => ids.has(id)) || intent.to !== void 0 && ids.has(intent.to));
				return {
					...graph,
					facts,
					intents
				};
			}, [graph, assetsOnly]);
			const board = (0, react.useMemo)(() => viewGraph ? buildBoard(viewGraph.facts, viewGraph.intents) : EMPTY_BOARD, [viewGraph]);
			const tally = (0, react.useMemo)(() => tallyOf(viewGraph?.facts ?? [], viewGraph?.intents ?? []), [viewGraph]);
			(0, react.useEffect)(() => {
				if (selected !== null && !board.byId.has(selected)) setSelected(null);
			}, [board, selected]);
			(0, react.useEffect)(() => {
				if (board.width > 0 && board.height > 0) setView({
					x: 0,
					y: 0,
					w: board.width,
					h: board.height
				});
			}, [board.width, board.height]);
			(0, react.useEffect)(() => {
				if (menu === null) return void 0;
				const close = (event) => {
					if (!barRef.current?.contains(event.target)) setMenu(null);
				};
				window.addEventListener("pointerdown", close);
				return () => window.removeEventListener("pointerdown", close);
			}, [menu]);
			const box = view ?? {
				x: 0,
				y: 0,
				w: Math.max(board.width, 800),
				h: Math.max(board.height, 500)
			};
			const fit = (0, react.useCallback)(() => {
				if (board.width > 0 && board.height > 0) setView({
					x: 0,
					y: 0,
					w: board.width,
					h: board.height
				});
			}, [board.width, board.height]);
			const frameSelection = (0, react.useCallback)(() => {
				if (selected === null) {
					fit();
					return;
				}
				const card = board.byId.get(selected);
				if (!card) {
					fit();
					return;
				}
				const pad = 80;
				setView({
					x: card.x - pad,
					y: card.y - pad,
					w: 374,
					h: card.height + pad * 2
				});
			}, [
				board.byId,
				fit,
				selected
			]);
			const connected = (0, react.useMemo)(() => {
				if (hovered === null) return null;
				const ids = new Set([hovered]);
				for (const edge of board.edges) {
					if (edge.from === hovered) ids.add(edge.to);
					if (edge.to === hovered) ids.add(edge.from);
				}
				return ids;
			}, [board.edges, hovered]);
			const onPointerDown = (0, react.useCallback)((event) => {
				if (event.target.closest("[data-card]")) return;
				setSelected(null);
				drag.current = {
					x: event.clientX,
					y: event.clientY
				};
			}, []);
			const onPointerMove = (0, react.useCallback)((event) => {
				const start = drag.current;
				const svg = svgRef.current;
				if (!start || !svg) return;
				const rect = svg.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				const dx = (event.clientX - start.x) / rect.width * box.w;
				const dy = (event.clientY - start.y) / rect.height * box.h;
				setView({
					x: box.x - dx,
					y: box.y - dy,
					w: box.w,
					h: box.h
				});
				drag.current = {
					x: event.clientX,
					y: event.clientY
				};
			}, [box]);
			const onPointerUp = (0, react.useCallback)(() => {
				drag.current = null;
			}, []);
			const onWheel = (0, react.useCallback)((event) => {
				const svg = svgRef.current;
				if (!svg) return;
				event.preventDefault();
				const rect = svg.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;
				const fx = (event.clientX - rect.left) / rect.width;
				const fy = (event.clientY - rect.top) / rect.height;
				const factor = event.deltaY > 0 ? 1.12 : .9;
				const w = box.w * factor;
				const h = box.h * factor;
				setView({
					x: box.x + (box.w - w) * fx,
					y: box.y + (box.h - h) * fy,
					w,
					h
				});
			}, [box]);
			const toggleMenu = (id) => {
				setMenu((current) => current === id ? null : id);
			};
			const running = (graph?.intents ?? []).filter((intent) => intent.worker && intent.status !== "done" && intent.status !== "abandoned");
			const link = paused ? "paused" : error ? "down" : "live";
			const selectedCard = selected !== null ? board.byId.get(selected) : void 0;
			const filteredEmpty = graph !== null && graph.facts.length + graph.intents.length > 0 && board.cards.length === 0;
			if (loading && graph === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					...rootStyle,
					padding: 24
				},
				children: "正在读取事实图…"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rootStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: barRef,
					style: toolbarStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: {
								fontSize: 14,
								fontWeight: 650,
								marginRight: 8,
								flexShrink: 0
							},
							children: "协作画板"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": assetsOnly,
							onClick: () => setAssetsOnly((value) => !value),
							style: {
								...textBtnStyle,
								...assetsOnly ? {
									color: TEAL,
									background: "color-mix(in srgb, var(--dsw-static-green-400) 16%, transparent)"
								} : {}
							},
							children: "资产"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-pressed": paused,
							onClick: () => setPaused((value) => !value),
							style: {
								...textBtnStyle,
								...paused ? { color: GOLD } : {}
							},
							children: paused ? "继续" : "暂停"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: {
								...textBtnStyle,
								...graph ? {} : {
									opacity: .4,
									cursor: "default"
								}
							},
							onClick: () => {
								if (graph) downloadGraph(graph);
							},
							children: "导出"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								marginLeft: "auto",
								display: "flex",
								alignItems: "center",
								gap: 12,
								minWidth: 0,
								flexShrink: 1
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									position: "relative",
									minWidth: 0,
									flexShrink: 1
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => toggleMenu("stats"),
									"aria-expanded": menu === "stats",
									style: {
										...textBtnStyle,
										color: MUTED,
										fontSize: 12,
										maxWidth: "100%",
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									children: [
										"资产 ",
										tally.asset,
										" / 意图 ",
										tally.intent,
										" / 成果 ",
										tally.finding,
										" / 凭据 ",
										tally.cred,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												color: MUTED,
												marginLeft: 8
											},
											children: "▸ 统计详情"
										})
									]
								}), menu === "stats" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										...menuStyle,
										right: 0,
										left: "auto",
										minWidth: 200
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "资产",
											value: tally.asset
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "意图",
											value: tally.intent
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "成果",
											value: tally.finding
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "凭据",
											value: tally.cred
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "线索",
											value: tally.clue
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "目标物",
											value: tally.objective
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "进行中",
											value: tally.open
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "已完成",
											value: tally.done
										})
									]
								}) : null]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LivePill, { link })]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						flex: 1,
						minHeight: 0,
						minWidth: 0,
						display: "flex"
					},
					children: [targets.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TargetRail, {
						targets,
						active: cwd ?? store,
						onPick: (next) => {
							setCwd(next);
							setSelected(null);
						}
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							flex: 1,
							minWidth: 0,
							minHeight: 0,
							display: "flex",
							flexDirection: "column"
						},
						children: [
							error && graph === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									padding: 24,
									display: "flex",
									flexDirection: "column",
									gap: 6
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: { color: "var(--dsw-alias-state-error-primary)" },
									children: "读取事实图失败"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: MUTED },
									children: error
								})]
							}) : null,
							graph !== null && graph.facts.length === 0 && graph.intents.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									padding: 24,
									display: "flex",
									flexDirection: "column",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: "这个目标还没有事实图" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: MUTED },
									children: "让指挥官先用 sapper_fact 记下第一条已确认的观察，这里就会长出节点。"
								})]
							}) : null,
							graph !== null && (graph.facts.length > 0 || graph.intents.length > 0) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									flex: 1,
									minHeight: 0,
									minWidth: 0,
									position: "relative",
									overflow: "hidden",
									background: CANVAS_BG
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
										ref: svgRef,
										viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`,
										width: "100%",
										height: "100%",
										style: {
											display: "block",
											cursor: drag.current ? "grabbing" : "grab",
											touchAction: "none"
										},
										role: "img",
										"aria-label": "协作画板",
										onPointerDown,
										onPointerMove,
										onPointerUp,
										onPointerLeave: onPointerUp,
										onWheel,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pattern", {
												id: "sb-grid",
												width: "18",
												height: "18",
												patternUnits: "userSpaceOnUse",
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
													cx: "1",
													cy: "1",
													r: "0.9",
													fill: GRID_DOT,
													fillOpacity: .45
												})
											}) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
												x: box.x,
												y: box.y,
												width: box.w,
												height: box.h,
												fill: CANVAS_BG
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
												x: box.x,
												y: box.y,
												width: box.w,
												height: box.h,
												fill: "url(#sb-grid)"
											}),
											board.edges.map((edge, index) => {
												const source = board.byId.get(edge.from);
												const target = board.byId.get(edge.to);
												if (!source || !target) return null;
												const dim = connected !== null && !(edge.from === hovered || edge.to === hovered);
												const x1 = source.x + CARD_W;
												const y1 = source.y + source.height / 2;
												const x2 = target.x;
												const y2 = target.y + target.height / 2;
												const dx = x2 - x1;
												const dy = y2 - y1;
												const span = Math.max(Math.abs(dx), 1);
												const dir = Math.sign(dx) || 1;
												const handle = span * .5;
												const side = dy === 0 ? 1 : Math.sign(dy);
												const sag = Math.max(span * .7, Math.abs(dy) * .55);
												return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
													d: `M${x1},${y1} C${x1 + dir * handle},${y1 + side * sag} ${x2 - dir * handle},${y2 + side * sag * .35} ${x2},${y2}`,
													fill: "none",
													stroke: edge.color,
													strokeOpacity: dim ? .06 : .92,
													strokeWidth: 1.6,
													strokeLinecap: "round"
												}, `edge-${edge.from}-${edge.to}-${index}`);
											}),
											board.cards.map((card, index) => {
												const accent = TYPE[card.type].color;
												const dim = connected !== null && !connected.has(card.id);
												const isHover = hovered === card.id;
												const isSelected = selected === card.id;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
													"data-card": true,
													opacity: dim ? .2 : 1,
													style: { cursor: "pointer" },
													onClick: () => setSelected(card.id),
													onMouseEnter: () => setHovered(card.id),
													onMouseLeave: () => setHovered(null),
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("title", { children: `${card.fact?.title ?? card.intent?.title ?? card.id}\n${card.fact?.description ?? card.intent?.description ?? ""}` }),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("clipPath", {
															id: `sb-clip-${index}`,
															clipPathUnits: "userSpaceOnUse",
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
																x: card.x,
																y: card.y,
																width: CARD_W,
																height: card.height,
																rx: 8
															})
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
															clipPath: `url(#sb-clip-${index})`,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
																x: card.x,
																y: card.y,
																width: CARD_W,
																height: card.height,
																fill: isHover ? CARD_BG_HOVER : CARD_BG
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
																x: card.x,
																y: card.y,
																width: 3,
																height: card.height,
																fill: accent
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
															x: card.x,
															y: card.y,
															width: CARD_W,
															height: card.height,
															rx: 8,
															fill: "none",
															stroke: isSelected ? BLUE : isHover ? "var(--dsw-alias-border-l4)" : CARD_BORDER,
															strokeWidth: isSelected ? 1.6 : 1
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
															transform: `translate(${card.x},${card.y})`,
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
																	x: 14,
																	y: card.chipY,
																	fill: accent,
																	fontSize: 10,
																	fontWeight: 700,
																	letterSpacing: .6,
																	children: card.badge
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
																	x: CARD_W - 12,
																	y: card.chipY,
																	textAnchor: "end",
																	fill: FAINT,
																	fontSize: 10,
																	children: card.id
																}),
																card.titleRows.map((row, rowIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
																	x: 14,
																	y: card.titleYs[rowIndex] ?? 0,
																	fill: LABEL,
																	fontSize: 12.5,
																	fontWeight: 600,
																	children: row
																}, rowIndex)),
																card.rows.map((row, rowIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
																	transform: `translate(0,${card.rowYs[rowIndex] ?? 0})`,
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
																		x: 14,
																		y: 0,
																		fill: FAINT,
																		fontSize: 10,
																		children: row.label
																	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
																		x: 48,
																		y: 0,
																		fill: VALUE,
																		fontSize: 11,
																		fontFamily: "var(--ds-font-family-code), ui-monospace, Menlo, Consolas, monospace",
																		children: row.value
																	})]
																}, rowIndex)),
																card.status !== null && card.statusY !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
																	x: CARD_W - 12,
																	y: card.statusY,
																	textAnchor: "end",
																	fill: STATUS_COLOR[card.status] ?? MUTED,
																	fontSize: 10,
																	children: STATUS_LABEL[card.status] ?? card.status
																}) : null
															]
														})
													]
												}, card.id);
											})
										]
									}),
									filteredEmpty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											position: "absolute",
											inset: 0,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											color: MUTED,
											pointerEvents: "none"
										},
										children: "当前筛选下没有节点"
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AgentPanel, {
										open: agentsOpen,
										onToggle: () => setAgentsOpen((value) => !value),
										running,
										selected: selectedCard,
										onSelect: (id) => {
											setAssetsOnly(false);
											setSelected(id);
										},
										onBack: () => setSelected(null)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ZoomStack, {
										onZoomIn: () => setView({
											x: box.x + box.w * .08,
											y: box.y + box.h * .08,
											w: box.w * .84,
											h: box.h * .84
										}),
										onZoomOut: () => setView({
											x: box.x - box.w * .08,
											y: box.y - box.h * .08,
											w: box.w * 1.16,
											h: box.h * 1.16
										}),
										onReset: fit,
										onFrame: frameSelection
									})
								]
							}) : null
						]
					})]
				})]
			});
		}
		function TargetRail({ targets, active, onPick }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				style: {
					width: 220,
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					minHeight: 0,
					borderRight: "1px solid var(--dsw-alias-border-l2)",
					background: "var(--dsw-specific-sidebar-fill)"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						padding: "12px 14px 8px",
						color: FAINT,
						fontSize: 11,
						fontWeight: 700,
						letterSpacing: .4
					},
					children: "目标"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						overflow: "auto",
						padding: "0 8px 12px"
					},
					children: targets.map((target) => {
						const on = target.cwd === active;
						const title = target.goal?.trim() || target.cwd.split(/[/\\]/).filter(Boolean).pop() || target.cwd;
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-pressed": on,
							title: target.cwd,
							onClick: () => onPick(target.cwd),
							style: {
								display: "block",
								width: "100%",
								textAlign: "left",
								border: on ? "1px solid var(--dsw-static-deepseek-450)" : "1px solid transparent",
								borderRadius: 8,
								padding: "8px 10px",
								marginBottom: 4,
								cursor: "pointer",
								background: on ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
								color: LABEL,
								fontFamily: "inherit"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									fontSize: 13,
									fontWeight: on ? 650 : 500,
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap"
								},
								children: title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									marginTop: 2,
									color: FAINT,
									fontSize: 11
								},
								children: [
									target.facts,
									" 事实 · ",
									target.intents,
									" 意图"
								]
							})]
						}, target.cwd);
					})
				})]
			});
		}
		function LivePill({ link }) {
			const color = link === "down" ? "var(--dsw-alias-state-error-primary)" : link === "paused" ? GOLD : LIVE;
			const text = link === "down" ? "通道中断" : link === "paused" ? "轮询已暂停" : "实时通道已连接";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					gap: 6,
					flexShrink: 0,
					padding: "4px 12px",
					borderRadius: 999,
					border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
					background: `color-mix(in srgb, ${color} 12%, transparent)`,
					color,
					fontSize: 12,
					whiteSpace: "nowrap"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
					width: 6,
					height: 6,
					borderRadius: 99,
					background: color
				} }), text]
			});
		}
		function StatRow({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					justifyContent: "space-between",
					gap: 24,
					padding: "5px 8px",
					fontSize: 12
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: { color: MUTED },
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: {
						color: VALUE,
						fontFamily: "var(--ds-font-family-code), ui-monospace, Menlo, Consolas, monospace"
					},
					children: value
				})]
			});
		}
		function AgentPanel({ open, onToggle, running, selected, onSelect, onBack }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("aside", {
				style: floatStyle,
				onWheel: (event) => event.stopPropagation(),
				children: selected !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "12px 14px",
						borderBottom: "1px solid var(--dsw-alias-border-l2)"
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onBack,
						style: {
							...textBtnStyle,
							padding: "2px 6px",
							color: MUTED
						},
						children: "←"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: {
							fontSize: 13,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap"
						},
						children: selected.fact?.title ?? selected.intent?.title ?? selected.id
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						maxHeight: "min(68vh, 560px)",
						overflow: "auto",
						padding: "12px 14px",
						overscrollBehavior: "contain"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								color: TYPE[selected.type].color,
								fontSize: 10,
								fontWeight: 700,
								letterSpacing: .8,
								marginBottom: 8
							},
							children: [
								TYPE[selected.type].label,
								" · ",
								selected.id
							]
						}),
						selected.kind === "fact" && selected.fact ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "要点",
								children: selected.fact.description ?? ""
							}),
							selected.fact.data && Object.keys(selected.fact.data).length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "结构化数据",
								mono: true,
								children: Object.entries(selected.fact.data).map(([key, value]) => `${key} = ${String(value)}`).join("\n")
							}) : null,
							selected.fact.doc ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "证据文档",
								mono: true,
								children: selected.fact.doc
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "记录",
								children: `${selected.fact.created_at ?? ""} · ${selected.fact.creator ?? ""}`
							})
						] }) : null,
						selected.kind === "intent" && selected.intent ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "要点",
								children: selected.intent.description ?? ""
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "出发事实",
								mono: true,
								children: (selected.intent.from ?? []).join(", ") || "—"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "产出事实",
								mono: true,
								children: selected.intent.to ?? "（尚未产出 · 待办）"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "执行车道",
								children: selected.intent.worker ?? "未认领"
							}),
							selected.intent.requires_confirmation ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "需确认",
								children: selected.intent.confirmed_at ? `已确认 ${selected.intent.confirmed_at}` : "待确认"
							}) : null,
							selected.intent.doc ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
								label: "作战手册",
								mono: true,
								children: selected.intent.doc
							}) : null
						] }) : null
					]
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "11px 14px"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: { fontSize: 13 },
							children: "运行中的智能体"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								minWidth: 18,
								height: 18,
								padding: "0 5px",
								borderRadius: 99,
								background: BLUE,
								color: "var(--dsw-alias-label-primary-foreground)",
								fontSize: 11,
								fontWeight: 700,
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center"
							},
							children: running.length
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onToggle,
							"aria-expanded": open,
							style: {
								...textBtnStyle,
								marginLeft: "auto",
								padding: "2px 4px",
								color: MUTED
							},
							children: open ? "▾" : "▸"
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						maxHeight: 320,
						overflow: "auto",
						padding: running.length === 0 ? "0 14px 14px" : "0 10px 10px",
						overscrollBehavior: "contain"
					},
					children: running.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: MUTED,
							fontSize: 12,
							lineHeight: 1.7
						},
						children: "暂无运行中的智能体 —— claim 活跃时会出现在这里。"
					}) : running.map((intent) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => onSelect(intent.id),
						style: {
							display: "block",
							width: "100%",
							textAlign: "left",
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: 8,
							padding: "8px 10px",
							marginBottom: 6,
							cursor: "pointer",
							background: "var(--dsw-alias-bg-layer-1)",
							color: LABEL,
							fontFamily: "inherit"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								marginBottom: 3
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									color: BLUE,
									fontSize: 11,
									fontWeight: 700
								},
								children: ["● ", intent.worker]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									marginLeft: "auto",
									color: FAINT,
									fontSize: 10
								},
								children: intent.id
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { fontSize: 12 },
							children: intent.title ?? ""
						})]
					}, intent.id))
				}) : null] })
			});
		}
		function ZoomStack({ onZoomIn, onZoomOut, onReset, onFrame }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					position: "absolute",
					right: 16,
					bottom: 16,
					display: "flex",
					flexDirection: "column",
					gap: 8,
					zIndex: 3
				},
				children: [
					{
						label: "放大",
						onClick: onZoomIn,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M8 3.2v9.6M3.2 8h9.6",
							stroke: "currentColor",
							strokeWidth: "1.4",
							strokeLinecap: "round"
						})
					},
					{
						label: "缩小",
						onClick: onZoomOut,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M3.2 8h9.6",
							stroke: "currentColor",
							strokeWidth: "1.4",
							strokeLinecap: "round"
						})
					},
					{
						label: "重置视图",
						onClick: onReset,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M12.2 6.2A4.6 4.6 0 1 0 12.6 10",
							stroke: "currentColor",
							strokeWidth: "1.3",
							fill: "none",
							strokeLinecap: "round"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "M12.2 3.2v3.2H9",
							stroke: "currentColor",
							strokeWidth: "1.3",
							fill: "none",
							strokeLinecap: "round",
							strokeLinejoin: "round"
						})] })
					},
					{
						label: "定位选中",
						onClick: onFrame,
						icon: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
							x: "3.2",
							y: "3.2",
							width: "9.6",
							height: "9.6",
							rx: "1.4",
							stroke: "currentColor",
							strokeWidth: "1.3",
							fill: "none"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
							x: "6",
							y: "6",
							width: "4",
							height: "4",
							rx: "0.6",
							stroke: "currentColor",
							strokeWidth: "1.1",
							fill: "none"
						})] })
					}
				].map((button) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					title: button.label,
					"aria-label": button.label,
					onClick: button.onClick,
					style: {
						width: 36,
						height: 36,
						borderRadius: 8,
						border: "1px solid var(--dsw-alias-border-l2)",
						background: "var(--dsw-alias-bg-layer-2)",
						color: LABEL,
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						padding: 0
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 16 16",
						"aria-hidden": "true",
						children: button.icon
					})
				}, button.label))
			});
		}
		/**
		* One labelled block in the detail panel.
		* @param props - label, body, and whether to render monospace.
		* @returns the block.
		*/
		function Field({ label, children, mono = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { marginBottom: 12 },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: {
						color: FAINT,
						fontSize: 10,
						fontWeight: 700,
						letterSpacing: .6,
						marginBottom: 4
					},
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
					style: {
						margin: 0,
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						fontSize: mono ? 11 : 12.5,
						fontFamily: mono ? "var(--ds-font-family-code), ui-monospace, Menlo, Consolas, monospace" : "inherit",
						color: label === "要点" ? LABEL : MUTED,
						lineHeight: 1.6
					},
					children
				})]
			});
		}
		//#endregion
		//#region src/client/SapperPanelIcon.tsx
		/**
		* Render the board's panel icon.
		* @param props - host-supplied icon size.
		* @returns the svg glyph.
		*/
		function SapperPanelIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4 4.5 L8 8 L12 4.5",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round",
						opacity: "0.55"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M8 8 L8 11.5",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round",
						opacity: "0.55"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "4",
						cy: "4",
						r: "1.7",
						fill: "currentColor"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "4",
						r: "1.7",
						fill: "currentColor",
						opacity: "0.6"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "8",
						cy: "11.8",
						r: "2",
						fill: "currentColor"
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* sapper board dictionaries.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "sapper";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"title": "协作画板",
			"loading": "正在读取事实图…",
			"empty.title": "事实图还是空的",
			"empty.body": "让指挥官先用 sapper_fact 记下第一条已确认的观察，这里就会长出节点。",
			"counts": "{facts} 事实 · {intents} 意图",
			"goal": "目标",
			"kind.host": "主机",
			"kind.service": "服务",
			"kind.cred": "凭据",
			"kind.vuln": "漏洞",
			"kind.loot": "战利品",
			"kind.flag": "FLAG",
			"kind.note": "笔记",
			"error": "读取事实图失败：{message}"
		};
		/** English dictionary, checked against the Chinese key set. */
		const en = {
			"title": "sapper board",
			"loading": "Reading the fact graph…",
			"empty.title": "The fact graph is still empty",
			"empty.body": "Have the commander record its first confirmed observation with sapper_fact and nodes will appear here.",
			"counts": "{facts} facts · {intents} intents",
			"goal": "Goal",
			"kind.host": "Host",
			"kind.service": "Service",
			"kind.cred": "Cred",
			"kind.vuln": "Vuln",
			"kind.loot": "Loot",
			"kind.flag": "FLAG",
			"kind.note": "Note",
			"error": "Failed to read the fact graph: {message}"
		};
		//#endregion
		//#region src/client/index.ts
		/** Panel id shared by the sidebar entry and the main-column page. */
		const SAPPER_PANEL_ID = "sapper-board";
		/** Required services: the slot registry and dictionaries. */
		const inject = ["slots", "locale"];
		/**
		* Client plugin body: register the dictionaries, the sidebar launcher and the
		* main-column page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-sapper-board: dictionaries");
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: SAPPER_PANEL_ID,
				order: 40,
				label: () => t("title"),
				locale: NS
			}, SapperPanelIcon));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: SAPPER_PANEL_ID
			}, SapperBoard));
		}
		//#endregion
		exports.SAPPER_PANEL_ID = SAPPER_PANEL_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map