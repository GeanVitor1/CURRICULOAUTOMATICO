import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFile} from 'node:fs/promises';
import {strFromU8,unzipSync} from 'fflate';
import ChromeExtensionInstallation from '../src/ChromeExtensionInstallation';
import {chromeWebStoreListing} from '../shared/chrome-extension-installation';

const listing='https://chromewebstore.google.com/detail/empregatos/'+'a'.repeat(32);
it('only enables the install button for an explicitly configured store listing',()=>{
 const manual=renderToStaticMarkup(createElement(ChromeExtensionInstallation,{storeUrl:''}));
 expect(manual).toContain('Instalação manual disponível');expect(manual).not.toContain('>Instalar no Chrome');
 expect(manual).toContain('chrome://extensions');expect(manual).toContain('Carregar sem compactação');
 const store=renderToStaticMarkup(createElement(ChromeExtensionInstallation,{storeUrl:listing}));
 expect(store).toContain(`href="${listing}"`);expect(store).toContain('Instalar no Chrome');
 expect(store).toContain('Adicionar ao Chrome');expect(store).not.toContain('ainda não foi publicada');
});
it.each(['javascript:alert(1)','https://example.test/detail/'+ 'a'.repeat(32),'https://chromewebstore.google.com/','https://chromewebstore.google.com.evil.test/detail/'+'a'.repeat(32),'https://user:password@chromewebstore.google.com/detail/'+'a'.repeat(32)])('rejects an unsafe or non-listing install URL: %s',value=>{
 expect(chromeWebStoreListing(value)).toBeNull();
});
it('keeps the real store destination and drops tracking parameters',()=>{
 expect(chromeWebStoreListing(listing+'?tracking=1#section')).toBe(listing);
});
it('replaces the installation guide after the extension has answered',()=>{
 const html=renderToStaticMarkup(createElement(ChromeExtensionInstallation,{installedVersion:'2.0.7',onOpenConnector:()=>{},storeUrl:listing}));
 expect(html).toContain('Extensão do EmpreGatos detectada');expect(html).toContain('Abrir conector do Chrome');
 expect(html).not.toContain('Extrair tudo');expect(html).not.toContain('Carregar sem compactação');expect(html).not.toContain('Instalar no Chrome');
});
it('packages the required store icon sizes, a short description and no local polling permission',async()=>{
 const files=unzipSync(await readFile('public/downloads/empregatos-chrome-web-store.zip'));
 const manifest=JSON.parse(strFromU8(files['manifest.json']));
 expect(manifest.description.length).toBeLessThanOrEqual(132);expect(manifest.permissions).not.toContain('alarms');
 expect(manifest.manifest_version).toBe(3);
 for(const size of [16,32,48,128]){
  const png=Buffer.from(files[manifest.icons[size]]);expect(png.subarray(1,4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(size);expect(png.readUInt32BE(20)).toBe(size);
 }
 expect(JSON.parse(strFromU8(files['release.json'])).channel).toBe('store');
});
