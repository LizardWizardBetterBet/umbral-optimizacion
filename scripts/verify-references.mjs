import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('referencias/MANIFIESTO.json','utf8'));
for(const image of manifest.archivos){
  const actual=createHash('sha256').update(readFileSync(`referencias/${image.archivo}`)).digest('hex');
  if(actual!==image.sha256)throw new Error(`Referencia dañada: ${image.archivo}`);
}
console.log(`OK ${manifest.archivos.length} imágenes verificadas con SHA-256`);
