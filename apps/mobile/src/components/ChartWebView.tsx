import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { Candle } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

type BridgeMessage =
  | { type: "chart-ready" }
  | { type: "point-selected"; close: number; time: string | number }
  | { type: "chart-error"; message: string };

const chartHtml = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#061621;color:#edf8ff;font:12px system-ui}canvas{display:block;width:100%;height:100%;touch-action:pan-x}.tip{position:fixed;top:8px;left:10px;padding:5px 8px;border-radius:6px;background:rgba(5,13,21,.88);color:#8fb1c6;pointer-events:none}
</style></head><body><canvas id="chart"></canvas><div class="tip" id="tip">Anatole Chart</div><script>
const canvas=document.getElementById('chart'),ctx=canvas.getContext('2d'),tip=document.getElementById('tip');let rows=[];
function send(payload){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(payload))}
function resize(){const dpr=window.devicePixelRatio||1;canvas.width=Math.max(innerWidth,320)*dpr;canvas.height=Math.max(innerHeight,240)*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
function draw(){const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);ctx.fillStyle='#061621';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#16394f';ctx.lineWidth=1;for(let i=1;i<5;i++){const y=i*h/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}if(!rows.length)return;const highs=rows.map(r=>Number(r.high)),lows=rows.map(r=>Number(r.low)),max=Math.max(...highs),min=Math.min(...lows),span=Math.max(max-min,.001),step=w/rows.length,body=Math.max(1,Math.min(7,step*.65));rows.forEach((r,i)=>{const x=(i+.5)*step,high=h-((r.high-min)/span)*(h-24)-12,low=h-((r.low-min)/span)*(h-24)-12,open=h-((r.open-min)/span)*(h-24)-12,close=h-((r.close-min)/span)*(h-24)-12,color=r.close>=r.open?'#00d7ad':'#ff365f';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,high);ctx.lineTo(x,low);ctx.stroke();ctx.fillRect(x-body/2,Math.min(open,close),body,Math.max(1,Math.abs(close-open)))})}
function receive(event){try{const message=JSON.parse(event.data);if(message.type==='set-data'){rows=message.candles||[];draw()}}catch(error){send({type:'chart-error',message:String(error)})}}
addEventListener('message',receive);document.addEventListener('message',receive);addEventListener('resize',resize);canvas.addEventListener('click',event=>{if(!rows.length)return;const index=Math.max(0,Math.min(rows.length-1,Math.floor(event.offsetX/(innerWidth/rows.length)))),row=rows[index];tip.textContent=new Date(row.time).toLocaleString()+' · '+Number(row.close).toFixed(2);send({type:'point-selected',close:row.close,time:row.time})});resize();send({type:'chart-ready'});
</script></body></html>`;

export function ChartWebView({ candles, label, ticker, timeframe, chartType = "candles", theme = "dark" }: { candles: Candle[]; label: string; ticker: string; timeframe: string; chartType?: "candles" | "line"; theme?: "dark" }) {
  const { language, pick } = useLocale();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify({ type: "set-data", ticker, timeframe, chartType, theme, candles }).replace(/</g, "\\u003c"), [candles, chartType, theme, ticker, timeframe]);
  const sendData = useCallback(() => { ref.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(payload)}}));true;`); }, [payload]);
  useEffect(() => { if (ready) sendData(); }, [ready, sendData]);
  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      if (message.type === "chart-ready") { setReady(true); sendData(); }
      if (message.type === "point-selected") setSelection(`${new Date(message.time).toLocaleString(language === "fr" ? "fr-CA" : "en-CA")} · ${message.close.toFixed(2)} CAD`);
    } catch { /* The bridge accepts only known JSON messages. */ }
  }
  return <View style={styles.shell} accessibilityLabel={`${pick("Graphique", "Chart")} ${label}`}><WebView ref={ref} source={{ html: chartHtml, baseUrl: "about:blank" }} originWhitelist={["about:blank"]} onMessage={onMessage} javaScriptEnabled scrollEnabled={false} bounces={false} style={styles.webview} testID="focus-chart-webview" />{selection ? <Text style={styles.selection}>{selection}</Text> : null}</View>;
}
const styles = StyleSheet.create({ shell: { overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, webview: { height: 340, backgroundColor: colors.surface }, selection: { ...typography.caption, color: colors.textMuted, padding: spacing.sm, textAlign: "center" } });
