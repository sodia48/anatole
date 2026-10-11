import { expect, test } from '@playwright/test';

for (const [width,height] of [[390,844],[768,1024],[1366,768],[1440,900]]) {
  for (const theme of ['blue','dark']) {
    test(`assistant viewport ${width}x${height} ${theme}`, async({page},info)=>{
      test.skip(info.project.name !== 'desktop-chromium','Viewport matrix runs once; existing assistant journeys also cover WebKit and mobile Chromium.');
      await page.setViewportSize({width,height});
      await page.addInitScript((theme)=>localStorage.setItem('anatole.preferences.v0.4',JSON.stringify({theme,language:'fr'})),theme);
      let release: (()=>void) | undefined;
      let calls=0;
      const answer='Résultat vérifié sur un univers limité.\n\n| Rang | ETF | Rendement 5 ans | CAGR | Devise |\n| --- | --- | --- | --- | --- |\n| 1 | VFV | 80 % | 12,47 % | CAD |\n\n'+Array.from({length:24},(_,i)=>`## Section ${i}\n- Les chiffres de cette fixture servent uniquement à vérifier la mise en page.\n- ${'Une limite documentée. '.repeat(8)}`).join('\n');
      await page.route('**/api/anatole/api/v1/assistant/chat',async route=>{
        calls++;
        if(calls===2) await new Promise<void>(resolve=>{release=resolve;});
        await route.fulfill({json:{intent:'etf_ranking',answer,evidence:[{sources:[{label:'Historique ETF vérifié',url:'https://finance.yahoo.com/quote/VFV.TO/history/',freshness:'delayed',timestamp:'2026-10-10T00:00:00Z'}],missing_data:[]}],actions:[{label:'Explorer les ETF',href:'/etf',kind:'navigate'}],conversation_id:'ba809b54-1d09-4cef-bb4b-bc3afae9175c'}});
      });
      await page.goto('/etf',{waitUntil:'domcontentloaded'});
      const launcher=page.getByRole('button',{name:'Ouvrir Anatole Assistant'});
      await expect(launcher).toBeVisible();
      await page.waitForFunction(()=>Object.keys(document.querySelector('button[aria-label="Ouvrir Anatole Assistant"]')??{}).some(k=>k.startsWith('__reactFiber')));
      await page.evaluate(()=>window.scrollTo(0,300));
      const pageTop=await page.evaluate(()=>window.scrollY);
      await launcher.click();
      const dialog=page.getByRole('dialog',{name:'Anatole Assistant'});
      const history=dialog.getByRole('log');
      const composer=dialog.getByLabel('Votre question');
      const send=dialog.getByRole('button',{name:'Envoyer la question'});
      const close=dialog.getByRole('button',{name:'Fermer l’assistant'});
      const within=async(maxHeight=height)=>{
        for(const node of [composer,send,close]){
          await expect(node).toBeInViewport();
          const box=(await node.boundingBox())!;
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y+box.height).toBeLessThanOrEqual(maxHeight+1);
          expect(box.x+box.width).toBeLessThanOrEqual(width+1);
        }
        expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
        expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      };
      await composer.fill('Quel ETF canadien a été le plus performant sur 5 ans ?');
      await send.click();
      await expect(dialog.getByRole('table')).toHaveCount(1);
      await within();
      expect(await history.evaluate(n=>n.scrollHeight>n.clientHeight)).toBe(true);
      expect(await page.evaluate(()=>window.scrollY)).toBe(pageTop);
      await expect.poll(()=>history.evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight)).toBeLessThan(5);
      await composer.fill('Et sur 3 ans ?');
      await send.click();
      await expect.poll(()=>Boolean(release)).toBe(true);
      await history.evaluate(n=>{n.scrollTop=140;});
      await expect.poll(()=>history.evaluate(n=>n.scrollTop)).toBe(140);
      release!();
      await expect(dialog.getByRole('table')).toHaveCount(2);
      await expect.poll(()=>history.evaluate(n=>n.scrollTop)).toBe(140);
      await close.click();
      await launcher.click();
      await expect.poll(()=>history.evaluate(n=>n.scrollTop)).toBe(140);
      await within();
      await history.evaluate(n=>{n.scrollTop=0;});
      await expect(dialog.getByRole('table').first()).toBeInViewport();
      await page.screenshot({path:info.outputPath(`assistant-${width}-${theme}.png`)});
      if(width===390){
        await page.evaluate(()=>{
          Object.defineProperty(window.visualViewport!,'height',{configurable:true,value:420});
          window.visualViewport!.dispatchEvent(new Event('resize'));
        });
        await within(420);
      }
      await dialog.getByRole('button',{name:'Nouvelle conversation'}).click();
      await expect(dialog.getByRole('table')).toHaveCount(0);
      await expect(composer).toHaveValue('');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(launcher).toBeFocused();
      expect(await page.evaluate(()=>window.scrollY)).toBe(pageTop);
    });
  }
}

test('a reset discards an in-flight reply and navigation refreshes context',async({page},info)=>{
  test.skip(info.project.name!=='desktop-chromium','Single lifecycle regression check.');
  let release:(()=>void)|undefined;
  let count=0;
  await page.route('**/api/anatole/api/v1/assistant/chat',async route=>{
    count++;
    if(count===1) await new Promise<void>(r=>{release=r;});
    await route.fulfill({json:{intent:'etf_ranking',answer:count===1?'Ancienne réponse obsolète':'Nouvelle réponse vérifiée',evidence:[],actions:[{label:'Ouvrir Terminal',href:'/terminal',kind:'navigate'}]}}).catch(()=>{});
  });
  await page.goto('/etf');
  const launcher=page.getByRole('button',{name:'Ouvrir Anatole Assistant'});
  await launcher.click();
  const dialog=page.getByRole('dialog',{name:'Anatole Assistant'});
  await dialog.getByLabel('Votre question').fill('Question initiale');
  await dialog.getByRole('button',{name:'Envoyer la question'}).click();
  await expect.poll(()=>Boolean(release)).toBe(true);
  await dialog.getByRole('button',{name:'Nouvelle conversation'}).click();
  release!();
  await expect(dialog).not.toContainText('Ancienne réponse obsolète');
  await dialog.getByLabel('Votre question').fill('Nouvelle question ETF');
  await dialog.getByRole('button',{name:'Envoyer la question'}).click();
  await expect(dialog).toContainText('Nouvelle réponse vérifiée');
  await dialog.getByRole('link',{name:'Ouvrir Terminal'}).click();
  await expect(page).toHaveURL(/\/terminal$/);
  await expect(dialog).toHaveCount(0);
  await launcher.click();
  await expect(dialog).toContainText('Terminal');
  await expect(dialog).toContainText('Nouvelle réponse vérifiée');
});
