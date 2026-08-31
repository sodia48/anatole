import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { Candle } from "@/src/lib/api/types";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

type BridgeMessage =
  | { type: "chart-ready" }
  | { type: "point-selected"; close: number; high: number; low: number; open: number; time: string | number; volume: number | null }
  | { type: "chart-error"; message: string };

export const chartHtml = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
html,body{margin:0;height:100%;overflow:hidden;background:#061621;color:#edf8ff;font:12px system-ui}canvas{display:block;width:100%;height:100%;touch-action:pan-x}.tip{position:fixed;z-index:2;top:8px;left:10px;max-width:210px;padding:7px 9px;border:1px solid #28536d;border-radius:7px;background:rgba(5,13,21,.94);color:#d9effc;line-height:1.45;white-space:pre-line;pointer-events:none}.tip[hidden]{display:none}
</style></head><body><canvas id="chart"></canvas><div class="tip" id="tip" hidden></div><script>
const canvas=document.getElementById('chart'),ctx=canvas.getContext('2d'),tip=document.getElementById('tip');
const PRICE_GUTTER=64;
let rows=[],language='fr';
function send(payload){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(payload))}
function finite(value){return typeof value==='number'&&Number.isFinite(value)}
function decimals(value){const absolute=Math.abs(value);return absolute>=1000?0:absolute>=100?1:absolute>=1?2:4}
function formatPrice(value){return finite(value)?value.toFixed(decimals(value)):'N/D'}
function compactVolume(value){if(!finite(value))return'N/D';const absolute=Math.abs(value),units=language==='fr'?[[1e9,' G'],[1e6,' M'],[1e3,' k']]:[[1e9,'B'],[1e6,'M'],[1e3,'K']];for(const unit of units){if(absolute>=unit[0]){const scaled=value/unit[0],digits=Math.abs(scaled)>=100?0:Math.abs(scaled)>=10?1:2;return scaled.toFixed(digits).replace(/\\.?0+$/,'').replace('.',language==='fr'?',':'.')+unit[1]}}return Math.round(value).toLocaleString(language==='fr'?'fr-CA':'en-CA')}
function dateValue(value){if(typeof value==='number')return new Date(value<1e12?value*1000:value);return new Date(value)}
function formatTime(value){const date=dateValue(value);if(Number.isNaN(date.getTime()))return String(value);return new Intl.DateTimeFormat(language==='fr'?'fr-CA':'en-CA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date)}
function resize(){const dpr=window.devicePixelRatio||1;canvas.width=Math.max(innerWidth,320)*dpr;canvas.height=Math.max(innerHeight,260)*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
function layout(){const w=innerWidth,h=innerHeight,left=8,plotRight=Math.max(left+80,w-PRICE_GUTTER),priceTop=10,priceBottom=Math.max(150,Math.round(h*.75)),volumeTop=Math.round(h*.78),volumeBottom=h-10;return{w,h,left,plotRight,priceTop,priceBottom,volumeTop,volumeBottom}}
function priceY(value,min,span,box){return box.priceBottom-((value-min)/span)*(box.priceBottom-box.priceTop)}
function drawPriceAxis(box,min,max,span){ctx.font='11px system-ui';ctx.textAlign='left';ctx.textBaseline='middle';for(let index=0;index<5;index++){const ratio=index/4,value=max-span*ratio,y=box.priceTop+(box.priceBottom-box.priceTop)*ratio;ctx.strokeStyle='#16394f';ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(box.left,y);ctx.lineTo(box.plotRight,y);ctx.stroke();ctx.fillStyle='#8fb1c6';ctx.fillText(formatPrice(value),box.plotRight+6,y)}ctx.strokeStyle='#28536d';ctx.beginPath();ctx.moveTo(box.plotRight,0);ctx.lineTo(box.plotRight,box.h);ctx.stroke()}
function drawLastPrice(box,row,min,span){const value=Number(row.close);if(!finite(value))return;const positive=Number(row.close)>=Number(row.open),color=positive?'#00b894':'#ff365f',y=Math.max(box.priceTop+9,Math.min(box.priceBottom-9,priceY(value,min,span,box)));ctx.strokeStyle=color;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(box.left,y);ctx.lineTo(box.plotRight,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color;ctx.fillRect(box.plotRight+2,y-10,PRICE_GUTTER-4,20);ctx.fillStyle='#041018';ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText(formatPrice(value),box.plotRight+PRICE_GUTTER/2,y)}
function drawVolumePane(box,maxVolume){ctx.strokeStyle='#28536d';ctx.beginPath();ctx.moveTo(box.left,box.volumeTop-7);ctx.lineTo(box.w,box.volumeTop-7);ctx.stroke();ctx.fillStyle='#8fb1c6';ctx.textAlign='left';ctx.font='11px system-ui';ctx.fillText('Volume',box.plotRight+6,box.volumeTop+2);const last=rows[rows.length-1],volume=finite(last&&last.volume)?Number(last.volume):null;ctx.fillStyle='#d9effc';ctx.fillText(compactVolume(volume),box.plotRight+6,box.volumeTop+18);if(maxVolume<=0)return;const step=(box.plotRight-box.left)/rows.length,body=Math.max(1,Math.min(7,step*.7));rows.forEach((row,index)=>{const volume=Number(row.volume);if(!finite(volume)||volume<0)return;const height=(volume/maxVolume)*(box.volumeBottom-box.volumeTop),x=box.left+(index+.5)*step;ctx.fillStyle=Number(row.close)>=Number(row.open)?'#00b894':'#d62f55';ctx.fillRect(x-body/2,box.volumeBottom-height,body,height)})}
function draw(){const box=layout();ctx.clearRect(0,0,box.w,box.h);ctx.fillStyle='#061621';ctx.fillRect(0,0,box.w,box.h);if(!rows.length)return;const highs=rows.map(row=>Number(row.high)).filter(finite),lows=rows.map(row=>Number(row.low)).filter(finite);if(!highs.length||!lows.length)return;const max=Math.max(...highs),min=Math.min(...lows),span=Math.max(max-min,.001),step=(box.plotRight-box.left)/rows.length,body=Math.max(1,Math.min(7,step*.65));drawPriceAxis(box,min,max,span);rows.forEach((row,index)=>{const x=box.left+(index+.5)*step,high=priceY(Number(row.high),min,span,box),low=priceY(Number(row.low),min,span,box),open=priceY(Number(row.open),min,span,box),close=priceY(Number(row.close),min,span,box),color=Number(row.close)>=Number(row.open)?'#00d7ad':'#ff365f';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x,high);ctx.lineTo(x,low);ctx.stroke();ctx.fillRect(x-body/2,Math.min(open,close),body,Math.max(1,Math.abs(close-open))) });drawLastPrice(box,rows[rows.length-1],min,span);const volumes=rows.map(row=>Number(row.volume)).filter(value=>finite(value)&&value>=0),maxVolume=volumes.length?Math.max(...volumes):0;drawVolumePane(box,maxVolume)}
function receive(event){try{const message=JSON.parse(event.data);if(message.type==='set-data'){rows=message.candles||[];language=message.language==='en'?'en':'fr';tip.hidden=true;draw()}}catch(error){send({type:'chart-error',message:String(error)})}}
function selectPoint(event){if(!rows.length)return;const box=layout(),x=event.offsetX;if(x<box.left||x>box.plotRight)return;const step=(box.plotRight-box.left)/rows.length,index=Math.max(0,Math.min(rows.length-1,Math.floor((x-box.left)/step))),row=rows[index],volume=finite(Number(row.volume))?Number(row.volume):null;tip.hidden=false;tip.textContent=formatTime(row.time)+'\\nO '+formatPrice(Number(row.open))+'   H '+formatPrice(Number(row.high))+'\\nL '+formatPrice(Number(row.low))+'   C '+formatPrice(Number(row.close))+'\\nVol '+compactVolume(volume);send({type:'point-selected',close:Number(row.close),high:Number(row.high),low:Number(row.low),open:Number(row.open),time:row.time,volume})}
addEventListener('message',receive);document.addEventListener('message',receive);addEventListener('resize',resize);canvas.addEventListener('pointerup',selectPoint);resize();send({type:'chart-ready'});
</script></body></html>`;

function candleDate(value: string | number, language: "fr" | "en"): string {
  const date = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(language === "fr" ? "fr-CA" : "en-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function compactVolume(value: number | null, language: "fr" | "en"): string {
  if (value === null || !Number.isFinite(value)) return "N/D";
  const units = language === "fr"
    ? [[1e12, " T"], [1e9, " G"], [1e6, " M"], [1e3, " k"]] as const
    : [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]] as const;
  const absolute = Math.abs(value);
  for (const [threshold, suffix] of units) {
    if (absolute >= threshold) {
      const scaled = value / threshold;
      const digits = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2;
      const compact = scaled.toFixed(digits).replace(/\.?0+$/, "");
      return `${language === "fr" ? compact.replace(".", ",") : compact}${suffix}`;
    }
  }
  return Math.round(value).toLocaleString(language === "fr" ? "fr-CA" : "en-CA");
}

export function ChartWebView({ candles, currency = "CAD", label, ticker, timeframe, chartType = "candles", theme = "dark" }: { candles: Candle[]; currency?: string; label: string; ticker: string; timeframe: string; chartType?: "candles" | "line"; theme?: "dark" }) {
  const { language, pick } = useLocale();
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const payload = useMemo(() => JSON.stringify({ type: "set-data", ticker, timeframe, chartType, theme, language, candles }).replace(/</g, "\\u003c"), [candles, chartType, language, theme, ticker, timeframe]);
  const sendData = useCallback(() => { ref.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent('message',{data:${JSON.stringify(payload)}}));true;`); }, [payload]);
  useEffect(() => { if (ready) sendData(); }, [ready, sendData]);
  function onMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as BridgeMessage;
      if (message.type === "chart-ready") { setReady(true); sendData(); }
      if (message.type === "point-selected") {
        const volume = compactVolume(message.volume, language);
        setSelection(`${candleDate(message.time, language)}\nO ${message.open.toFixed(2)}   H ${message.high.toFixed(2)}\nL ${message.low.toFixed(2)}   C ${message.close.toFixed(2)} ${currency}\n${pick("Vol", "Vol")} ${volume}`);
      }
    } catch { /* The bridge accepts only known JSON messages. */ }
  }
  return <View style={styles.shell} accessibilityLabel={`${pick("Graphique", "Chart")} ${label}`}><WebView ref={ref} source={{ html: chartHtml, baseUrl: "about:blank" }} originWhitelist={["about:blank"]} onMessage={onMessage} javaScriptEnabled scrollEnabled={false} bounces={false} style={styles.webview} testID="focus-chart-webview" />{selection ? <Text style={styles.selection}>{selection}</Text> : null}</View>;
}
const styles = StyleSheet.create({ shell: { overflow: "hidden", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, webview: { height: 380, backgroundColor: colors.surface }, selection: { ...typography.caption, color: colors.textMuted, padding: spacing.sm, textAlign: "center", lineHeight: 19 } });
