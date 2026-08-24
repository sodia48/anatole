"use client";

import { Focus, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { CompanyNetworkNode, CompanyRelationship } from "@/lib/types";

import { relationshipLabel } from "./labels";
import styles from "./CompanyNetwork.module.css";

type Point = { x: number; y: number };

function layoutNodes(
  center: CompanyNetworkNode,
  nodes: CompanyNetworkNode[],
  relationships: CompanyRelationship[],
): Map<string, Point> {
  const positions = new Map<string, Point>([[center.id, { x: 450, y: 270 }]]);
  const incoming: CompanyNetworkNode[] = [];
  const outgoing: CompanyNetworkNode[] = [];
  const lower: CompanyNetworkNode[] = [];
  const byId = new Map(nodes.map((item) => [item.id, item]));
  for (const node of nodes) {
    if (node.id === center.id) continue;
    const direct = relationships.find((item) => (
      (item.source_node_id === node.id && item.target_node_id === center.id)
      || (item.source_node_id === center.id && item.target_node_id === node.id)
    ));
    if (!direct || ["strategic_partner", "joint_venture", "subsidiary"].includes(direct.relationship_type)) lower.push(node);
    else if (direct.target_node_id === center.id) incoming.push(node);
    else outgoing.push(node);
  }
  const distribute = (items: CompanyNetworkNode[], x: number, start: number, gap: number) => {
    items.forEach((item, index) => positions.set(item.id, { x, y: start + index * gap }));
  };
  distribute(incoming.slice(0, 12), 130, 70, Math.min(88, 470 / Math.max(1, incoming.length)));
  distribute(outgoing.slice(0, 12), 770, 70, Math.min(88, 470 / Math.max(1, outgoing.length)));
  distribute(lower.slice(0, 12), 275, 520, 0);
  lower.slice(0, 12).forEach((item, index) => positions.set(item.id, { x: 255 + index * 110, y: 530 + (index % 2) * 55 }));
  for (const relationship of relationships) {
    for (const id of [relationship.source_node_id, relationship.target_node_id]) {
      if (!positions.has(id) && byId.has(id)) positions.set(id, { x: 450, y: 610 });
    }
  }
  return positions;
}

export function CompanyNetworkGraph({
  center,
  nodes,
  relationships,
  selectedRelationship,
  language,
  onSelectRelationship,
  onRecenter,
  onExpand,
  onFind,
}: {
  center: CompanyNetworkNode;
  nodes: CompanyNetworkNode[];
  relationships: CompanyRelationship[];
  selectedRelationship: CompanyRelationship | null;
  language: AnatoleLanguage;
  onSelectRelationship: (relationship: CompanyRelationship) => void;
  onRecenter: (node: CompanyNetworkNode) => void;
  onExpand: (node: CompanyNetworkNode) => void;
  onFind: (node: CompanyNetworkNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState<CompanyNetworkNode | null>(null);
  const positions = useMemo(() => layoutNodes(center, nodes, relationships), [center, nodes, relationships]);
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const beginPan = (event: PointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return;
    dragRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    setPan({ x: event.clientX - dragRef.current.x, y: event.clientY - dragRef.current.y });
  };
  const wheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setZoom((value) => Math.max(0.55, Math.min(1.8, value + (event.deltaY < 0 ? 0.1 : -0.1))));
  };
  const reset = () => { setPan({ x: 0, y: 0 }); setZoom(1); };
  const fullscreen = () => void containerRef.current?.requestFullscreen?.();

  return (
    <section className={styles.graphShell} aria-label={pick(language, "Réseau économique interactif", "Interactive economic network")} ref={containerRef}>
      <div className={styles.graphControls}>
        <button type="button" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} aria-label={pick(language, "Zoom avant", "Zoom in")}><Plus size={15} /></button>
        <button type="button" onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))} aria-label={pick(language, "Zoom arrière", "Zoom out")}><Minus size={15} /></button>
        <button type="button" onClick={reset} aria-label={pick(language, "Ajuster la vue", "Fit view")}><Focus size={15} /></button>
        <button type="button" onClick={() => onRecenter(center)} aria-label={pick(language, "Recentrer", "Recenter")}><RotateCcw size={15} /></button>
        <button type="button" onClick={fullscreen} aria-label={pick(language, "Plein écran", "Fullscreen")}><Maximize2 size={15} /></button>
      </div>
      <svg
        className={styles.graph}
        viewBox="0 0 900 650"
        role="img"
        aria-label={`${center.name} · ${nodes.length} ${pick(language, "nœuds", "nodes")} · ${relationships.length} ${pick(language, "relations", "relationships")}`}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={() => { dragRef.current = null; }}
        onPointerCancel={() => { dragRef.current = null; }}
        onWheel={wheel}
      >
        <defs>
          <marker id="ecosystem-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5f9bc3" /></marker>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {relationships.map((relationship) => {
            const from = positions.get(relationship.source_node_id);
            const to = positions.get(relationship.target_node_id);
            if (!from || !to) return null;
            const selected = selectedRelationship?.id === relationship.id;
            return (
              <g
                key={relationship.id}
                role="button"
                tabIndex={0}
                aria-label={`${relationshipLabel(relationship.relationship_type, language)} · ${byId.get(relationship.source_node_id)?.name} → ${byId.get(relationship.target_node_id)?.name}`}
                onClick={() => onSelectRelationship(relationship)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectRelationship(relationship); }}
                className={styles.edge}
              >
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={styles.edgeHitArea}
                  aria-hidden="true"
                />
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={selected ? styles.edgeSelected : relationship.confidence === "secondary" ? styles.edgeSecondary : styles.edgeLine} markerEnd="url(#ecosystem-arrow)" />
                <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 7}>{relationshipLabel(relationship.relationship_type, language)}</text>
              </g>
            );
          })}
          {nodes.map((node) => {
            const point = positions.get(node.id);
            if (!point) return null;
            const active = node.id === center.id;
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.name}${node.ticker ? ` · ${node.ticker}` : ""}`}
                transform={`translate(${point.x - 68} ${point.y - 28})`}
                className={`${styles.node} ${active ? styles.centerNode : ""}`}
                onClick={() => setSelectedNode(node)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedNode(node); }}
              >
                <rect width="136" height="56" rx="10" />
                <text x="68" y="23" textAnchor="middle">{node.ticker ?? (node.node_type === "private_company" ? "PRIVATE" : node.node_type.toUpperCase())}</text>
                <text x="68" y="41" textAnchor="middle" className={styles.nodeName}>{node.name.slice(0, 22)}</text>
              </g>
            );
          })}
        </g>
      </svg>
      {selectedNode ? (
        <div className={styles.nodeActions} role="status">
          <div><strong>{selectedNode.name}</strong><span>{selectedNode.sector ?? pick(language, "Secteur non publié", "Sector not published")}</span></div>
          {selectedNode.public_company && selectedNode.ticker ? <button type="button" onClick={() => onRecenter(selectedNode)}>{pick(language, "Recentrer le réseau", "Recenter network")}</button> : null}
          {selectedNode.public_company && selectedNode.ticker ? <button type="button" onClick={() => onExpand(selectedNode)}>{pick(language, "Étendre à la profondeur 2", "Expand to depth 2")}</button> : null}
          {selectedNode.public_company && selectedNode.ticker ? <Link href={`/focus/${encodeURIComponent(selectedNode.ticker)}`}>{pick(language, "Ouvrir Focus", "Open Focus")}</Link> : null}
          {selectedNode.ticker && selectedNode.id !== center.id ? <button type="button" onClick={() => onFind(selectedNode)}>{pick(language, "Trouver le lien", "Find relationship")}</button> : null}
        </div>
      ) : null}
    </section>
  );
}
