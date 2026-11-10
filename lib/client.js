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
		*
		* The last read per route is kept in a module-level cache, so a remount (the
		* panel unmounts when switched away) paints the previous read at once and
		* refreshes behind it instead of staring at the loading line again.
		* @param paused - when true, keep the last graph and stop polling.
		* @param cwd - store directory to read; null asks the Host to pick one.
		* @returns the latest graph, the target list, and loading and error state.
		*/
		const cache = new Map();
		function useSapperGraph(paused = false, cwd = null) {
			const route = cwd === null || cwd.length === 0 ? GRAPH_ROUTE : `${GRAPH_ROUTE}?cwd=${encodeURIComponent(cwd)}`;
			const [state, setState] = (0, react.useState)(() => cache.get(route) ?? {
				graph: null,
				targets: [],
				loading: true,
				error: null,
				store: null
			});
			(0, react.useEffect)(() => {
				let cancelled = false;
				const read = async () => {
					try {
						const response = await fetch(route, { headers: { accept: "application/json" } });
						if (!response.ok) throw new Error(`HTTP ${response.status}`);
						const payload = await response.json();
						if (cancelled) return;
						const next = {
							graph: payload.graph ?? null,
							targets: payload.targets ?? [],
							loading: false,
							error: null,
							store: payload.store ?? null
						};
						cache.set(route, next);
						setState(next);
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
				const tick = () => {
					if (!document.hidden) read();
				};
				const onVisible = () => {
					if (!document.hidden) read();
				};
				const timer = setInterval(tick, POLL_MS);
				document.addEventListener("visibilitychange", onVisible);
				return () => {
					cancelled = true;
					clearInterval(timer);
					document.removeEventListener("visibilitychange", onVisible);
				};
			}, [paused, route]);
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
		const GAP_X = 148;
		const LANE_GAP = 10;
		const LANE_MARGIN = 14;
		const MAX_LANES = 6;
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
			complete: "已收口",
			confirmed: "已确认"
		};
		const STATUS_COLOR = {
			tested: TEAL,
			blocked: GOLD,
			open: BLUE,
			claimed: GOLD,
			pending: FAINT,
			done: TEAL,
			complete: TEAL,
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
			height: 0,
			focusHeight: 0
		};
		const START_ID = "__start__";
		const TARGET_ID = "__target__";
		const TREE_GAP = 36;
		function compareId(a, b) {
		  return a.localeCompare(b, void 0, { numeric: true });
		}
		function isLiveIntent(intent) {
		  const status = intent.status ?? (intent.to === null || intent.to === void 0 ? "open" : "done");
		  return status === "claimed" || status === "open" || status === "pending";
		}
		function isRunningIntent(intent) {
		  const worker = typeof intent.worker === "string" ? intent.worker.trim() : "";
		  return worker !== "" && isLiveIntent(intent);
		}
		function cardHaystack(card) {
		  return [
		    card.id,
		    card.badge,
		    card.status ?? "",
		    ...(card.titleRows ?? []),
		    ...(card.rows ?? []).flatMap((row) => [row.label, row.value]),
		    card.fact?.title ?? "",
		    card.fact?.description ?? "",
		    card.fact?.kind ?? "",
		    card.intent?.title ?? "",
		    card.intent?.description ?? "",
		    card.intent?.worker ?? "",
		    ...(card.intent?.from ?? []),
		    card.intent?.to ?? ""
		  ].join("\n").toLowerCase();
		}
		function linkPath(source, target, edge) {
		  const x1 = source.x + CARD_W;
		  const y1 = edge.y1;
		  const x2 = target.x;
		  const y2 = edge.y2;
		  const span = Math.max(x2 - x1, 32);
		  const handle = Math.min(Math.max(span * 0.42, 48), 140);
		  return `M${x1},${y1} C${x1 + handle},${y1} ${x2 - handle},${y2} ${x2},${y2}`;
		}
		function buildBoard(facts, intents) {
		  if (facts.length === 0 && intents.length === 0) return EMPTY_BOARD;
		  const titles = new Map(facts.map((fact) => [fact.id, fact.title?.trim() || fact.id]));
		  const titleUnits = (CARD_W - 28) / 12.5;
		  const rowUnits = (CARD_W - 64) / 10.5;
		  const cards = [];
		  const byId = /* @__PURE__ */ new Map();
		  const present = (id, kind, type, badge, titleSource, rows, status, fact, intent) => {
		    const titleRows = wrap(titleSource, titleUnits, 2);
		    const displayRows = rows.map((row) => ({ label: row.label, value: wrap(row.value, rowUnits, 1)[0] ?? "" }));
		    let cursor = 20;
		    const chipY = cursor;
		    cursor += 16;
		    const titleYs = titleRows.map((_, index) => cursor + index * 17);
		    cursor += titleRows.length * 17 + 8;
		    const rowYs = displayRows.map((_, index) => cursor + index * 15);
		    cursor += displayRows.length * 15;
		    const statusY = status !== null ? cursor + 14 : null;
		    const height2 = Math.max(CARD_MIN_H, (statusY ?? cursor) + 12);
		    const card = {
		      id,
		      kind,
		      ...fact ? { fact } : {},
		      ...intent ? { intent } : {},
		      type,
		      badge,
		      titleRows,
		      rows: displayRows,
		      status,
		      x: 0,
		      y: 0,
		      height: height2,
		      column: 0,
		      chipY,
		      titleYs,
		      rowYs,
		      statusY,
		      loose: false
		    };
		    cards.push(card);
		    byId.set(card.id, card);
		    return card;
		  };
		  for (const fact of facts) {
		    if (fact.id === "goal") continue;
		    const type = factType(fact);
		    present(
		      fact.id,
		      "fact",
		      type,
		      TYPE[type].label,
		      fact.title?.trim() || fact.description?.trim() || fact.id,
		      factRows(fact),
		      typeof fact.data?.status === "string" ? fact.data.status : null,
		      fact
		    );
		  }
		  for (const intent of intents) {
		    const open = intent.to == null;
		    const from = intent.from ?? [];
		    const rows = [{
		      label: "\u6765\u6E90",
		      value: from.length > 0 ? from.map((id) => titles.get(id) ?? id).join("\u3001") : "\u2014"
		    }];
		    if (intent.worker) rows.push({ label: "\u6267\u884C", value: intent.worker });
		    present(
		      intent.id,
		      "intent",
		      "intent",
		      "\u5B50\u4EFB\u52A1",
		      intent.title?.trim() || intent.description?.trim() || intent.id,
		      rows,
		      intent.status ?? (open ? "open" : "done"),
		      void 0,
		      intent
		    );
		  }
		  const goal = facts.find((fact) => fact.id === "goal");
		  const start = present(
		    START_ID,
		    "fact",
		    "objective",
		    "\u8D77\u70B9",
		    goal?.description?.trim() || goal?.title?.trim() || "\u8D77\u70B9",
		    [],
		    null,
		    goal
		  );
		  const producedBy = /* @__PURE__ */ new Map();
		  for (const intent of intents) {
		    if (intent.to && intent.to !== "goal" && byId.has(intent.to)) producedBy.set(intent.to, intent.id);
		  }
		  const intentById = new Map(intents.map((intent) => [intent.id, intent]));
		  const flowIds = /* @__PURE__ */ new Set([START_ID]);
		  for (const intent of intents) {
		    flowIds.add(intent.id);
		    for (const id of intent.from ?? []) {
		      if (id !== "goal" && byId.has(id)) flowIds.add(id);
		    }
		    if (intent.to && intent.to !== "goal" && byId.has(intent.to)) flowIds.add(intent.to);
		  }
		  const sourcesOf = (id) => {
		    if (id === START_ID) return [];
		    const producer = producedBy.get(id);
		    if (producer) return [producer];
		    const intent = intentById.get(id);
		    if (!intent) return [];
		    return (intent.from ?? []).filter((source) => source !== "goal" && source !== id && flowIds.has(source));
		  };
		  const columnMemo = /* @__PURE__ */ new Map();
		  const columnOf = (id, seen = /* @__PURE__ */ new Set()) => {
		    const cached = columnMemo.get(id);
		    if (cached !== void 0) return cached;
		    if (id === START_ID) {
		      columnMemo.set(id, 0);
		      return 0;
		    }
		    if (seen.has(id)) return 1;
		    seen.add(id);
		    let column = 1;
		    const producer = producedBy.get(id);
		    if (producer) column = columnOf(producer, seen) + 1;
		    else {
		      const sources = sourcesOf(id);
		      if (sources.length > 0) column = Math.max(...sources.map((source) => columnOf(source, seen))) + 1;
		    }
		    columnMemo.set(id, column);
		    return column;
		  };
		  for (const id of flowIds) columnOf(id);
		  const placed = /* @__PURE__ */ new Set();
		  const columnCursor = /* @__PURE__ */ new Map();
		  const take = (id, idealCenter) => {
		    const card = byId.get(id);
		    if (!card || id === START_ID || placed.has(id)) return card;
		    const column = columnOf(id);
		    const cursor = columnCursor.get(column) ?? PAD_Y;
		    const y = Math.max(cursor, idealCenter - card.height / 2);
		    card.column = column;
		    card.x = PAD_X + column * (CARD_W + GAP_X);
		    card.y = y;
		    columnCursor.set(column, y + card.height + TREE_GAP);
		    placed.add(id);
		    return card;
		  };
		  const centerOf = (card) => card.y + card.height / 2;
		  const placing = /* @__PURE__ */ new Set();
		  const placeIntent = (intent) => {
		    if (placed.has(intent.id) || placing.has(intent.id)) return;
		    placing.add(intent.id);
		    const sources = sourcesOf(intent.id);
		    for (const source of sources) {
		      const producer = producedBy.get(source);
		      const upstream = producer ? intentById.get(producer) : void 0;
		      if (upstream) placeIntent(upstream);
		    }
		    for (const source of sources) {
		      if (!producedBy.has(source)) take(source, PAD_Y);
		    }
		    const anchors = sources.filter((source) => producedBy.has(source));
		    const aligned = (anchors.length > 0 ? anchors : sources).map((source) => byId.get(source)).filter((card2) => card2 !== void 0 && placed.has(card2.id));
		    const mid = aligned.length > 0 ? aligned.reduce((sum, card2) => sum + centerOf(card2), 0) / aligned.length : columnCursor.get(columnOf(intent.id)) ?? PAD_Y;
		    const card = take(intent.id, mid);
		    if (card && intent.to && intent.to !== "goal" && byId.has(intent.to)) take(intent.to, centerOf(card));
		    placing.delete(intent.id);
		  };
		  const pending = intents.filter((intent) => sourcesOf(intent.id).every((source) => !producedBy.has(source)));
		  const waiting = [...pending];
		  while (waiting.length > 0) {
		    waiting.sort((a, b) => {
		      const share = (item) => sourcesOf(item.id).filter((source) => placed.has(source)).length;
		      return share(b) - share(a) || compareId(a.id, b.id);
		    });
		    const next = waiting.shift();
		    if (next) placeIntent(next);
		  }
		  const later = intents.filter((intent) => sourcesOf(intent.id).some((source) => producedBy.has(source)));
		  later.sort((a, b) => compareId(a.id, b.id));
		  for (const intent of later) placeIntent(intent);
		  let minY = Infinity;
		  let maxY = -Infinity;
		  for (const id of flowIds) {
		    if (id === START_ID) continue;
		    const card = byId.get(id);
		    if (!card || !placed.has(card.id)) continue;
		    minY = Math.min(minY, card.y);
		    maxY = Math.max(maxY, card.y + card.height);
		  }
		  start.column = 0;
		  start.x = PAD_X;
		  start.y = (Number.isFinite(minY) ? (minY + maxY) / 2 : PAD_Y) - start.height / 2;
		  const shift = PAD_Y - Math.min(Number.isFinite(minY) ? minY : PAD_Y, start.y);
		  if (shift > 0) {
		    for (const id of flowIds) {
		      const card = byId.get(id);
		      if (card) card.y += shift;
		    }
		  }
		  const maxColumn = Math.max(0, ...[...flowIds].map((id) => byId.get(id)?.column ?? 0));
		  const flowCards = [...flowIds].map((id) => byId.get(id)).filter((card) => card !== void 0);
		  const treeMid = flowCards.reduce((sum, card) => sum + centerOf(card), 0) / Math.max(flowCards.length, 1);
		  const target = present(
		    TARGET_ID,
		    "fact",
		    "objective",
		    "\u76EE\u6807",
		    goal?.title?.trim() || "\u76EE\u6807",
		    goal ? factRows(goal) : [],
		    null,
		    goal
		  );
		  target.column = maxColumn + 1;
		  target.x = PAD_X + target.column * (CARD_W + GAP_X);
		  target.y = treeMid - target.height / 2;
		  const liveIntent = new Set(intents.filter(isLiveIntent).map((intent) => intent.id));
		  const edges = [];
		  const seenEdge = /* @__PURE__ */ new Set();
		  const pushEdge = (from, to, live, label) => {
		    const key = `${from}>${to}`;
		    if (seenEdge.has(key) || from === to) return;
		    const source = byId.get(from);
		    const dest = byId.get(to);
		    if (!source || !dest) return;
		    seenEdge.add(key);
		    edges.push({
		      from,
		      to,
		      color: live ? GOLD : EDGE,
		      dashed: false,
		      lane: 0,
		      laneY: 0,
		      y1: source.y + source.height / 2,
		      y2: dest.y + dest.height / 2,
		      live,
		      label
		    });
		  };
		  for (const id of flowIds) {
		    if (id === START_ID || sourcesOf(id).length > 0) continue;
		    pushEdge(START_ID, id, liveIntent.has(id), "");
		  }
		  for (const intent of intents) {
		    const sources = sourcesOf(intent.id);
		    const live = liveIntent.has(intent.id);
		    for (const id of sources) pushEdge(id, intent.id, live, sources.length === 1 ? live ? "\u63A8\u8FDB" : "\u63A8\u5BFC" : "");
		    if (intent.to && intent.to !== "goal" && byId.has(intent.to)) {
		      const card = byId.get(intent.to);
		      const blocked = card?.status === "blocked" || intent.status === "blocked";
		      if (blocked && card) card.badge = "\u963B\u585E";
		      pushEdge(intent.id, intent.to, live, blocked ? "\u963B\u585E" : "\u4EA7\u51FA");
		    }
		  }
		  const outgoing = new Set(edges.map((edge) => edge.from));
		  const leaves = [...flowIds].filter((id) => id !== START_ID && !outgoing.has(id));
		  for (const id of leaves) {
		    const producer = producedBy.get(id);
		    const live = liveIntent.has(id) || producer !== void 0 && liveIntent.has(producer);
		    pushEdge(id, TARGET_ID, live, leaves.length > 2 ? "" : live ? "\u63A8\u8FDB" : "\u6307\u5411");
		  }
		  const loose = cards.filter((card) => card.id !== TARGET_ID && !flowIds.has(card.id));
		  const flowBottom = Math.max(target.y + target.height, ...flowCards.map((card) => card.y + card.height));
		  if (loose.length > 0) {
		    const gridCols = Math.min(Math.max(target.column + 1, 1), Math.max(loose.length, 1), 6);
		    loose.sort((a, b) => compareId(a.id, b.id));
		    const rowHeights = [];
		    loose.forEach((card, index) => {
		      const row = Math.floor(index / gridCols);
		      rowHeights[row] = Math.max(rowHeights[row] ?? 0, card.height);
		    });
		    const rowTop = [];
		    let cursor = flowBottom + 72;
		    for (const height2 of rowHeights) {
		      rowTop.push(cursor);
		      cursor += height2 + GAP_Y;
		    }
		    loose.forEach((card, index) => {
		      const column = index % gridCols;
		      const row = Math.floor(index / gridCols);
		      card.loose = true;
		      card.column = column;
		      card.x = PAD_X + column * (CARD_W + GAP_X);
		      card.y = rowTop[row] ?? cursor;
		    });
		  }
		  const bottom = Math.max(...cards.map((card) => card.y + card.height));
		  const span = Math.max(...cards.map((card) => card.column)) + 1;
		  const width = PAD_X * 2 + (span - 1) * (CARD_W + GAP_X) + CARD_W;
		  const height = Math.max(460, bottom + 72);
		  const focusHeight = Math.min(height, flowBottom + 56);
		  return { cards, byId, edges, width, height, focusHeight };
		}
		function tallyOfBoard(cards) {
			const tally = {
				asset: 0,
				finding: 0,
				cred: 0,
				clue: 0,
				objective: 0,
				intent: 0,
				open: 0,
				done: 0
			};
			for (const card of cards) {
				if (card.loose || card.id === START_ID || card.id === TARGET_ID) continue;
				if (card.kind === "intent") {
					tally.intent += 1;
					if (card.status === "done" || card.status === "complete" || card.status === "abandoned") tally.done += 1;
					else tally.open += 1;
					continue;
				}
				switch (card.fact?.kind) {
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
			}
			return tally;
		}
		function auditedFindings(facts) {
			const ledger = /* @__PURE__ */ new Map();
			for (const note of facts) {
				if (note.kind !== "note" || !(note.title ?? "").startsWith("审计：")) continue;
				const target = typeof note.data?.target === "string" ? note.data.target : "";
				if (target === "") continue;
				const raw = String(note.data?.verdict ?? "").trim().toLowerCase();
				const verdict = raw === "pass" || raw === "通过" || raw === "审计通过" ? "pass" : "reject";
				ledger.set(target, {
					verdict,
					level: String(note.data?.level ?? "").trim(),
					reason: note.description?.trim() ?? "",
					missing: String(note.data?.missing ?? "").trim()
				});
			}
			const rows = [];
			for (const fact of facts) {
				if (fact.kind !== "vuln") continue;
				const audit = ledger.get(fact.id);
				if (!audit) continue;
				rows.push({
					id: fact.id,
					title: fact.title?.trim() || fact.description?.trim() || fact.id,
					description: fact.description?.trim() ?? "",
					...audit
				});
			}
			rows.sort((a, b) => (a.verdict === b.verdict ? 0 : a.verdict === "pass" ? -1 : 1) || compareId(a.id, b.id));
			return rows;
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
			const [railOpen, setRailOpen] = (0, react.useState)(true);
			const [showLoose, setShowLoose] = (0, react.useState)(false);
			const [search, setSearch] = (0, react.useState)("");
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
			const tally = (0, react.useMemo)(() => tallyOfBoard(board.cards), [board.cards]);
			(0, react.useEffect)(() => {
				if (selected !== null && !board.byId.has(selected)) setSelected(null);
			}, [board, selected]);
			(0, react.useEffect)(() => {
				if (board.width <= 0 || board.height <= 0) return;
				const query = search.trim().toLowerCase();
				if (query !== "") {
					const hits = board.cards.filter((card) => cardHaystack(card).includes(query));
					if (hits.length === 0) return;
					const minX = Math.min(...hits.map((card) => card.x)) - 64;
					const minY = Math.min(...hits.map((card) => card.y)) - 48;
					const maxX = Math.max(...hits.map((card) => card.x + CARD_W)) + 64;
					const maxY = Math.max(...hits.map((card) => card.y + card.height)) + 48;
					setView({
						x: minX,
						y: minY,
						w: Math.max(maxX - minX, 480),
						h: Math.max(maxY - minY, 320)
					});
					return;
				}
				const focus = showLoose || board.focusHeight <= 0 ? board.height : Math.min(board.focusHeight, board.height);
				setView({
					x: 0,
					y: 0,
					w: board.width,
					h: focus
				});
			}, [board, search, showLoose]);
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
				if (board.width <= 0 || board.height <= 0) return;
				const focus = showLoose || board.focusHeight <= 0 ? board.height : Math.min(board.focusHeight, board.height);
				setView({
					x: 0,
					y: 0,
					w: board.width,
					h: focus
				});
			}, [board.width, board.height, board.focusHeight, showLoose]);
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
			const running = (graph?.intents ?? []).filter(isRunningIntent);
			const query = search.trim().toLowerCase();
			const matched = query === "" ? null : new Set(board.cards.filter((card) => cardHaystack(card).includes(query)).map((card) => card.id));
			const shown = (card) => {
				if (card.id === selected) return true;
				if (matched !== null) return matched.has(card.id);
				return !card.loose || showLoose;
			};
			const looseCount = board.cards.filter((card) => card.loose).length;
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
							children: "攻击图谱"
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: search,
							onChange: (event) => setSearch(event.target.value),
							placeholder: "搜索事实、意图",
							"aria-label": "搜索事实或意图",
							style: {
								width: 168,
								marginLeft: 8,
								height: 28,
								flexShrink: 0,
								borderRadius: 6,
								border: "1px solid var(--dsw-alias-border-l2)",
								background: "var(--dsw-alias-bg-layer-2)",
								color: LABEL,
								fontSize: 12,
								padding: "0 8px",
								fontFamily: "inherit"
							}
						}),
						looseCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							"aria-pressed": showLoose,
							title: "这些事实没有被任何意图的来源或产出引用，所以没有连线",
							onClick: () => setShowLoose((value) => !value),
							style: {
								...textBtnStyle,
								...showLoose ? { color: GOLD } : { color: MUTED }
							},
							children: ["未引用 ", looseCount]
						}) : null,
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
									title: "只统计图上连出来的节点，不含未引用事实",
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
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatRow, {
											label: "未引用",
											value: looseCount
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
						open: railOpen,
						onToggle: () => setRailOpen((value) => !value),
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
										"aria-label": "攻击图谱",
										onPointerDown,
										onPointerMove,
										onPointerUp,
										onPointerLeave: onPointerUp,
										onWheel,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("defs", { children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pattern", {
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
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("marker", {
													id: "sb-arrow",
													viewBox: "0 0 8 8",
													markerWidth: "7",
													markerHeight: "7",
													refX: "7",
													refY: "4",
													orient: "auto",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
														d: "M0,1 L7,4 L0,7 Z",
														fill: EDGE
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("marker", {
													id: "sb-arrow-live",
													viewBox: "0 0 8 8",
													markerWidth: "7",
													markerHeight: "7",
													refX: "7",
													refY: "4",
													orient: "auto",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
														d: "M0,1 L7,4 L0,7 Z",
														fill: GOLD
													})
												})
											] }),
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
												if (!source || !target || !shown(source) || !shown(target)) return null;
												const hot = hovered !== null && (edge.from === hovered || edge.to === hovered);
												const dim = connected !== null && !hot;
												const d = linkPath(source, target, edge);
												const labelX = (source.x + CARD_W + target.x) / 2;
												const labelY = (edge.y1 + edge.y2) / 2 - 7;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
													pointerEvents: "none",
													children: [
														edge.live ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
															d,
															fill: "none",
															stroke: GOLD,
															strokeOpacity: dim ? .04 : .28,
															strokeWidth: 7,
															strokeLinecap: "round"
														}) : null,
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("path", {
															d,
															fill: "none",
															stroke: edge.live ? GOLD : edge.color,
															strokeOpacity: hot ? .98 : dim ? .05 : edge.live ? .95 : .72,
															strokeWidth: edge.live ? 2.1 : 1.35,
															strokeLinecap: "round",
															strokeLinejoin: "round",
															strokeDasharray: edge.live ? "14 18" : void 0,
															markerEnd: edge.live ? "url(#sb-arrow-live)" : "url(#sb-arrow)",
															children: edge.live ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("animate", {
																attributeName: "stroke-dashoffset",
																from: "64",
																to: "0",
																dur: "1.15s",
																repeatCount: "indefinite"
															}) : null
														}),
														edge.label ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
															x: labelX,
															y: labelY,
															textAnchor: "middle",
															fill: edge.live ? GOLD : MUTED,
															fontSize: 11,
															children: edge.label
														}) : null
													]
												}, `edge-${edge.from}-${edge.to}-${index}`);
											}),
											board.cards.map((card, index) => {
												const accent = TYPE[card.type].color;
												const dim = connected !== null && !connected.has(card.id);
												const isHover = hovered === card.id;
												const isSelected = selected === card.id;
												const pin = card.badge === "起点" || card.badge === "目标";
												if (!shown(card)) return null;
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
															stroke: isSelected ? BLUE : pin ? GOLD : isHover ? "var(--dsw-alias-border-l4)" : CARD_BORDER,
															strokeWidth: isSelected || pin ? 1.6 : 1
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
									matched !== null && matched.size === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											position: "absolute",
											left: 16,
											bottom: 16,
											color: MUTED,
											fontSize: 12,
											pointerEvents: "none"
										},
										children: ["没有匹配「", search.trim(), "」"]
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
		function TargetRail({ targets, active, open, onToggle, onPick }) {
			if (!open) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
				style: {
					width: 36,
					flexShrink: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					gap: 10,
					minHeight: 0,
					paddingTop: 10,
					borderRight: "1px solid var(--dsw-alias-border-l2)",
					background: "var(--dsw-specific-sidebar-fill)"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: onToggle,
						"aria-expanded": false,
						title: "展开目标",
						style: { ...textBtnStyle, padding: "4px 6px", color: MUTED },
						children: "›"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							writingMode: "vertical-rl",
							color: FAINT,
							fontSize: 11,
							fontWeight: 700,
							letterSpacing: 2
						},
						children: "目标"
					})
				]
			});
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
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						padding: "8px 8px 8px 14px"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								color: FAINT,
								fontSize: 11,
								fontWeight: 700,
								letterSpacing: .4
							},
							children: "目标"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: onToggle,
							"aria-expanded": true,
							title: "收起目标",
							style: { ...textBtnStyle, marginLeft: "auto", padding: "2px 6px", color: MUTED },
							children: "‹"
						})
					]
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
		//#region src/client/VulnLibraryIcon.tsx
		function VulnLibraryIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "2.2",
						y: "2.2",
						width: "11.6",
						height: "11.6",
						rx: "2",
						stroke: "currentColor",
						strokeWidth: "1.3"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4.7 6.1 H11.3",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4.7 8.5 H11.3",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M4.7 10.9 H8.2",
						stroke: "currentColor",
						strokeWidth: "1.3",
						strokeLinecap: "round"
					})
				]
			});
		}
		//#endregion
		//#region src/client/VulnLibrary.tsx
		function reportTarget(path) {
			const parts = String(path ?? "").split(/[/\\]/);
			const at = parts.lastIndexOf("漏洞报告");
			const raw = at > 0 ? parts[at - 1] : "";
			return raw.replace(/^【/, "").replace(/】$/, "");
		}
		function hostsIn(text) {
			return [...new Set(text?.match(/(?:\d{1,3}\.){3}\d{1,3}|[a-z0-9][-a-z0-9]*\.[a-z]{2,}/gi) ?? [])];
		}
		function targetChoices(targets) {
			const rows = [];
			const seen = new Set();
			for (const target of targets ?? []) {
				const hosts = hostsIn(target.goal);
				const folder = target.cwd.replace(/[\\/]\.sapper$/i, "").split(/[/\\]/).filter(Boolean).pop() ?? "";
				const labels = hosts.length > 0 ? hosts : folder === "" ? [] : [folder];
				for (const label of labels) {
					if (seen.has(label)) continue;
					seen.add(label);
					rows.push({ label, cwd: target.cwd });
				}
			}
			return rows;
		}
		function reportRows(graph) {
			if (!graph) return [];
			if (Array.isArray(graph.reports) && graph.reports.length > 0) return graph.reports.map((row) => ({ ...row, target: reportTarget(row.path) }));
			return auditedFindings(graph.facts ?? []).filter((row) => row.verdict === "pass").map((row) => {
				const fact = graph.facts.find((item) => item.id === row.id);
				const data = fact?.data ?? {};
				const host = typeof data.host === "string" ? data.host : typeof data.ip === "string" ? data.ip : "";
				return { name: row.title, summary: row.description, level: row.level, path: "", target: host, url: typeof data.url === "string" ? data.url : "", id: row.id };
			});
		}
		function levelColor(level) {
			if (level === "严重" || level === "高危") return "var(--dsw-alias-state-error-primary)";
			if (level === "中危") return GOLD;
			return FAINT;
		}
		function FolderMark() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 28 28",
				"aria-hidden": "true",
				style: { flex: "none", color: "var(--dsw-static-amber-400)" },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.8 10.21c0-.68 0-1.02.05-1.34.14-.82.52-1.57 1.1-2.16.22-.23.5-.43 1.05-.84.29-.21.43-.31.58-.4.39-.22.81-.36 1.25-.41.17-.02.35-.02.71-.02h4.11c.81 0 1.22 0 1.6.1.13.03.26.07.38.12.37.15.7.38 1.37.85l1.26.9c.29.21.43.31.6.38.05.02.1.03.16.05.17.04.35.04.7.04h2.08c2.25 0 3.37 0 4.16.57.26.19.48.41.67.66.57.79.57 1.92.57 4.16v5.85c0 2.25 0 3.37-.57 4.16-.19.26-.41.48-.67.67-.79.57-1.91.57-4.16.57H8.2c-2.25 0-3.37 0-4.16-.57a2.8 2.8 0 0 1-.67-.67C2.8 22.1 2.8 20.98 2.8 18.73V10.21Z",
					fill: "currentColor"
				})
			});
		}
		function Chevron() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: "12",
				height: "12",
				viewBox: "0 0 12 12",
				fill: "none",
				"aria-hidden": "true",
				style: { flex: "none", opacity: 0.7 },
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M2.5 4.5 L6 8 L9.5 4.5",
					stroke: "currentColor",
					strokeWidth: "1.3",
					strokeLinecap: "round",
					strokeLinejoin: "round"
				})
			});
		}
		function TargetSwitch({ names, active, onPick }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [hover, setHover] = (0, react.useState)(null);
			const root = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!open) return;
				const close = (event) => {
					if (!root.current?.contains(event.target)) setOpen(false);
				};
				window.addEventListener("pointerdown", close);
				return () => window.removeEventListener("pointerdown", close);
			}, [open]);
			if (names.length === 0) return null;
			const move = (delta) => {
				const at = hover === null ? -1 : names.indexOf(hover);
				const next = at === -1 ? (delta > 0 ? 0 : names.length - 1) : Math.min(names.length - 1, Math.max(0, at + delta));
				setHover(names[next] ?? null);
			};
			const onKeyDown = (event) => {
				if (!open) {
					if (event.key === "ArrowDown" || event.key === "ArrowUp") {
						event.preventDefault();
						setOpen(true);
					}
					return;
				}
				if (event.key === "Escape") {
					setOpen(false);
					return;
				}
				if (event.key === "ArrowDown") {
					event.preventDefault();
					move(1);
					return;
				}
				if (event.key === "ArrowUp") {
					event.preventDefault();
					move(-1);
					return;
				}
				if (event.key === "Enter" && hover !== null) {
					event.preventDefault();
					onPick(hover);
					setOpen(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: root,
				onKeyDown,
				style: { position: "relative", flexShrink: 1, minWidth: 0, maxWidth: 280 },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "dsh-sapper-hoverable",
						"aria-haspopup": "menu",
						"aria-expanded": open,
						"aria-label": "切换目标",
						onClick: () => setOpen((value) => !value),
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 8,
							maxWidth: "100%",
							height: 32,
							padding: "0 12px",
							border: "1px solid var(--dsw-alias-border-l2)",
							borderRadius: 8,
							color: LABEL,
							font: "inherit",
							fontSize: 13,
							cursor: "pointer"
						},
						title: active || "全部目标",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
								children: active || "全部目标"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, {})
						]
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "menu",
						style: {
							position: "absolute",
							top: "calc(100% + 6px)",
							right: 0,
							zIndex: 6,
							minWidth: 180,
							maxWidth: 280,
							padding: 6,
							borderRadius: 10,
							background: "var(--dsw-alias-bg-layer-3)",
							border: "1px solid var(--dsw-alias-border-l2)",
							boxShadow: "0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "menuitem",
							onClick: () => {
								onPick("");
								setOpen(false);
							},
							style: {
								display: "block",
								width: "100%",
								textAlign: "left",
								border: "none",
								borderRadius: 6,
								padding: "8px 10px",
								cursor: "pointer",
								background: active === "" ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
								color: LABEL,
								font: "inherit",
								fontSize: 13
							},
							children: "全部目标"
						}, "all"), ...names.map((name) => {
							const on = name === active;
							const hot = hover === name;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								role: "menuitem",
								onMouseEnter: () => setHover(name),
								onMouseLeave: () => setHover(null),
								onClick: () => {
									onPick(name);
									setOpen(false);
								},
								style: {
									display: "block",
									width: "100%",
									textAlign: "left",
									border: "none",
									borderRadius: 6,
									padding: "8px 10px",
									cursor: "pointer",
									background: on || hot ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
									color: LABEL,
									font: "inherit",
									fontSize: 13
								},
								children: name
							}, name);
						})]
					}) : null
				]
			});
		}
		function ReportCard({ row }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				title: row.path !== "" ? "双击打开报告" : void 0,
				onDoubleClick: () => {
					if (row.path === "") return;
					void fetch("/api/sapper/open-file", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ path: row.path })
					});
				},
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 8,
					padding: "10px 12px",
					marginBottom: 8,
					background: "var(--dsw-alias-bg-layer-2)",
					cursor: row.path !== "" ? "pointer" : "default"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { display: "flex", alignItems: "baseline", gap: 8 },
						children: [
							row.level !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { color: levelColor(row.level), fontSize: 12, fontWeight: 650, flexShrink: 0 },
								children: row.level
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: { fontSize: 14, fontWeight: 650, lineHeight: 1.45 },
								children: row.name
							})
						]
					}),
					row.url ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 4, color: MUTED, fontSize: 12, lineHeight: 1.5, wordBreak: "break-all" },
						children: row.url
					}) : null
				]
			});
		}
		const APP_NAME = {
			explorer: "文件资源管理器",
			finder: "访达",
			filemanager: "文件管理器",
			cursor: "Cursor",
			vscode: "VS Code",
			vscodeinsiders: "VS Code Insiders",
			windsurf: "Windsurf",
			sublimetext: "Sublime Text",
			intellij: "IntelliJ IDEA",
			pycharm: "PyCharm",
			webstorm: "WebStorm",
			goland: "GoLand",
			rider: "Rider",
			androidstudio: "Android Studio"
		};
		const CHOICE_KEY = "dsh.sapper.report-app";
		function reportDirectory(rows, target) {
			const row = (target === "" ? void 0 : rows.find((item) => item.target === target && item.path !== "")) ?? rows.find((item) => item.path !== "");
			if (!row) return "";
			const parts = String(row.path).split(/[/\\]/);
			const at = parts.lastIndexOf("漏洞报告");
			if (at < 0) return "";
			return parts.slice(0, at + 1).join(String(row.path).includes("\\") ? "\\" : "/");
		}
		function AppIcon({ id }) {
			const [failed, setFailed] = (0, react.useState)(false);
			if (failed) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FolderMark, {});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				src: `/open-in-app/icon/${id}`,
				alt: "",
				width: 16,
				height: 16,
				style: { flex: "none", objectFit: "contain" },
				onError: () => setFailed(true)
			});
		}
		function OpenFolderButton({ directory }) {
			const [apps, setApps] = (0, react.useState)([]);
			const [open, setOpen] = (0, react.useState)(false);
			const [hover, setHover] = (0, react.useState)(null);
			const [choice, setChoice] = (0, react.useState)(() => localStorage.getItem(CHOICE_KEY) ?? "");
			const root = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				let cancelled = false;
				void fetch("/open-in-app/apps", { headers: { accept: "application/json" } }).then(async (response) => response.ok ? await response.json() : null).then((payload) => {
					if (cancelled || !payload || !Array.isArray(payload.apps)) return;
					setApps(payload.apps.filter((id) => typeof id === "string" && APP_NAME[id] !== void 0));
				}).catch(() => {});
				return () => { cancelled = true; };
			}, []);
			(0, react.useEffect)(() => {
				if (!open) return;
				const close = (event) => {
					if (!root.current?.contains(event.target)) setOpen(false);
				};
				window.addEventListener("pointerdown", close);
				return () => window.removeEventListener("pointerdown", close);
			}, [open]);
			const named = apps.length > 0 ? apps : ["explorer"];
			const preferred = named.includes(choice) ? choice : named[0] ?? "explorer";
			const disabled = directory === "";
			const launch = (app) => {
				if (disabled) return;
				setChoice(app);
				localStorage.setItem(CHOICE_KEY, app);
				setOpen(false);
				void fetch("/open-in-app/open", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ app, path: directory })
				});
			};
			const label = APP_NAME[preferred] ?? preferred;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: root,
				style: { position: "relative", display: "inline-flex" },
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						title: `用 ${label} 打开`,
						className: "dsh-sapper-splitbtn",
						style: {
							display: "inline-flex",
							alignItems: "stretch",
							height: 24,
							overflow: "hidden",
							border: "0.5px solid var(--dsw-alias-border-l4)",
							borderRadius: "var(--dsw-radius-sm, 6px)",
							opacity: disabled ? 0.4 : 1
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": `用 ${label} 打开`,
								disabled,
								onClick: () => launch(preferred),
								style: {
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									padding: "3px 5px",
									border: 0,
									cursor: disabled ? "default" : "pointer"
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AppIcon, { id: preferred }, preferred)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								"aria-label": "更多打开方式",
								"aria-haspopup": "menu",
								"aria-expanded": open,
								disabled,
								onClick: () => setOpen((value) => !value),
								style: {
									display: "inline-flex",
									alignItems: "center",
									justifyContent: "center",
									padding: "3px 4px 3px 3px",
									border: 0,
									borderLeft: "0.5px solid var(--dsw-alias-border-l4)",
									color: MUTED,
									cursor: disabled ? "default" : "pointer"
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, {})
							})
						]
					}),
					open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "menu",
						style: {
							position: "absolute",
							top: "calc(100% + 6px)",
							right: 0,
							zIndex: 8,
							minWidth: 220,
							padding: 6,
							borderRadius: 10,
							background: "var(--dsw-alias-bg-layer-3)",
							border: "1px solid var(--dsw-alias-border-l2)",
							boxShadow: "0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent)"
						},
						children: named.map((id) => {
							const name = APP_NAME[id] ?? id;
							const on = id === preferred;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "menuitem",
								onMouseEnter: () => setHover(id),
								onMouseLeave: () => setHover(null),
								onClick: () => launch(id),
								style: {
									display: "flex",
									alignItems: "center",
									gap: 8,
									width: "100%",
									textAlign: "left",
									border: "none",
									borderRadius: 6,
									padding: "6px 8px",
									cursor: "pointer",
									background: on || hover === id ? "var(--dsw-specific-sidebar-nav-item-active)" : "transparent",
									color: LABEL,
									font: "inherit",
									fontSize: 13
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
										src: `/open-in-app/icon/${id}`,
										alt: "",
										width: 16,
										height: 16,
										style: { flex: "none" }
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: on ? `${name}（默认）` : name })
								]
							}, id);
						})
					}) : null
				]
			});
		}
		const TARGET_KEY = "dsh.sapper.report-target";
		const HOVER_CSS = `
.dsh-sapper-hoverable { background: var(--dsw-alias-bg-layer-2); }
.dsh-sapper-hoverable:hover:not(:disabled) { background: var(--dsw-specific-sidebar-nav-item-active); }
.dsh-sapper-splitbtn > button { background: none; }
.dsh-sapper-splitbtn > button:hover:not(:disabled) { background: var(--dsw-specific-sidebar-nav-item-active); }
`;
		function storedTarget() {
			try {
				const parsed = JSON.parse(localStorage.getItem(TARGET_KEY) ?? "null");
				if (typeof parsed?.label !== "string" || typeof parsed?.cwd !== "string") return null;
				if (parsed.label === "" || parsed.cwd === "") return null;
				return { label: parsed.label, cwd: parsed.cwd };
			} catch {
				return null;
			}
		}
		function VulnLibrary() {
			const remembered = (0, react.useMemo)(storedTarget, []);
			const [cwd, setCwd] = (0, react.useState)(remembered?.cwd ?? null);
			const [picked, setPicked] = (0, react.useState)(remembered?.label ?? null);
			const [query, setQuery] = (0, react.useState)("");
			const { graph, loading, error, targets, store } = useSapperGraph(false, cwd);
			const menu = (0, react.useMemo)(() => targetChoices(targets), [targets]);
			const rows = (0, react.useMemo)(() => reportRows(graph), [graph]);
			const fromReports = (0, react.useMemo)(() => [...new Set(rows.map((row) => row.target).filter((name) => name !== ""))], [rows]);
			const names = fromReports.length > 0 ? fromReports : menu.map((choice) => choice.label);
			const active = picked !== null && names.includes(picked) ? picked : "";
			const scoped = active === "" ? rows : rows.filter((row) => row.target === active || String(row.path ?? "").includes(active));
			const needle = query.trim().toLowerCase();
			const shown = needle === "" ? scoped : scoped.filter((row) => row.name.toLowerCase().includes(needle));
			const folderTarget = active || fromReports[0] || "";
			const directory = reportDirectory(rows, folderTarget);
			if (loading && graph === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: { ...rootStyle, padding: 24 },
				children: "正在读取事实图…"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rootStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: HOVER_CSS }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { ...toolbarStyle, overflow: "visible", zIndex: 5 },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: { fontSize: 14, fontWeight: 650, flexShrink: 0 },
								children: "漏洞报告"
							}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: MUTED, fontSize: 12, flexShrink: 0 },
							children: shown.length
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							value: query,
							onChange: (event) => setQuery(event.target.value),
							placeholder: "搜索名称",
							"aria-label": "搜索漏洞报告",
							style: {
								width: 160,
								height: 28,
								boxSizing: "border-box",
								flexShrink: 1,
								minWidth: 90,
								padding: "0 10px",
								borderRadius: 8,
								border: "1px solid var(--dsw-alias-border-l2)",
								background: "var(--dsw-alias-bg-layer-2)",
								color: LABEL,
								font: "inherit",
								fontSize: 13
							}
						}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TargetSwitch, {
							names,
							active,
							onPick: (name) => {
								if (name === "") {
									setPicked(null);
									localStorage.removeItem(TARGET_KEY);
									return;
								}
								setPicked(name);
								const choice = menu.find((item) => item.label === name);
								if (choice) {
									setCwd(choice.cwd);
									localStorage.setItem(TARGET_KEY, JSON.stringify({ label: name, cwd: choice.cwd }));
								}
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenFolderButton, { directory })]
							})]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { padding: "10px 16px", color: "var(--dsw-alias-state-error-primary)", fontSize: 12 },
						children: ["读取事实图失败：", error]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { overflow: "auto", padding: 16, minHeight: 0 },
						children: shown.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: { color: MUTED, fontSize: 13, lineHeight: 1.7 },
							children: scoped.length === 0 ? "这个目标还没有漏洞报告。" : "没有匹配的报告。"
						}) : shown.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReportCard, { row }, row.path !== "" ? row.path : row.id ?? row.name))
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
			"title": "攻击图谱",
			"library.title": "漏洞报告",
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
			"title": "attack graph",
			"library.title": "vuln reports",
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
		const VULN_PANEL_ID = "sapper-vulns";
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
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: VULN_PANEL_ID,
				order: 41,
				label: () => t("library.title"),
				locale: NS
			}, VulnLibraryIcon));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: VULN_PANEL_ID
			}, VulnLibrary));
		}
		//#endregion
		exports.SAPPER_PANEL_ID = SAPPER_PANEL_ID;
		exports.VULN_PANEL_ID = VULN_PANEL_ID;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map