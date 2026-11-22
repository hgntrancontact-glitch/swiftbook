import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {inflateSync} from 'node:zlib';
import {PDFDocument,PDFName,PDFDict,PDFRawStream,PDFNumber} from 'pdf-lib';
import {convertAnyFileToPdfBytes,convertImageToPdfBytes,convertMultipleFilesToSinglePdfBytes} from '../src/utils/fileConverter';

function imageStream(doc:PDFDocument,page=0) {
  const images=doc.getPage(page).node.Resources()!.lookup(PDFName.of('XObject'),PDFDict);
  const image=doc.context.lookup(images.values()[0]);assert.ok(image instanceof PDFRawStream);
  return image;
}
function jpegWithOrientation(jpeg:Uint8Array,orientation:number,little=true) {
  const exif=Buffer.alloc(36);exif.writeUInt16BE(0xffe1,0);exif.writeUInt16BE(34,2);exif.write('Exif\0\0',4,'binary');
  const start=10,view=new DataView(exif.buffer,exif.byteOffset,exif.length);
  view.setUint16(start,little?0x4949:0x4d4d);view.setUint16(start+2,42,little);view.setUint32(start+4,8,little);
  view.setUint16(start+8,1,little);view.setUint16(start+10,0x112,little);view.setUint16(start+12,3,little);
  view.setUint32(start+14,1,little);view.setUint16(start+18,orientation,little);
  return Buffer.concat([jpeg.subarray(0,2),exif,jpeg.subarray(2)]);
}

test('uploaded and pasted PNGs preserve every RGB/alpha sample and the aspect ratio, including thin screenshots',async()=>{
  for(const [width,height] of [[100,10],[40,100],[1024,768]]) {
    const pixels=Buffer.alloc(width*height*4);
    for(let i=0;i<pixels.length;i+=4){pixels[i]=i%253;pixels[i+1]=(i*7)%251;pixels[i+2]=(i*3)%255;pixels[i+3]=(i*13)%256;}
    const png=await sharp(pixels,{raw:{width,height,channels:4}}).png().toBuffer();
    const file=new File([new Uint8Array(png)],'screenshot.png',{type:'image/png'});
    for(const options of [undefined,{preserveAspectRatio:true}]) {
      const converted=await convertAnyFileToPdfBytes(file,true,options),doc=await PDFDocument.load(converted.bytes);
      assert.equal(doc.getPageCount(),1);assert.equal(converted.fileName,'screenshot.png');
      const page=doc.getPage(0);assert.ok(Math.abs(page.getWidth()/page.getHeight()-width/height)<1e-9);
      const image=imageStream(doc);
      assert.equal(image.dict.lookup(PDFName.of('Width'),PDFNumber).asNumber(),width);
      assert.equal(image.dict.lookup(PDFName.of('Height'),PDFNumber).asNumber(),height);
      const rgb=inflateSync(image.contents),alpha=doc.context.lookup(image.dict.get(PDFName.of('SMask')));assert.ok(alpha instanceof PDFRawStream);
      const rgba=Buffer.alloc(pixels.length),mask=inflateSync(alpha.contents);
      for(let i=0;i<width*height;i++){rgb.copy(rgba,i*4,i*3,i*3+3);rgba[i*4+3]=mask[i];}
      assert.deepEqual(rgba,pixels,'No JPEG conversion, resizing, or alpha loss');
    }
  }
});

test('JPEGs embed byte-for-byte, retaining their pixels and all eight EXIF orientations without browser decode',async()=>{
  const jpeg=await sharp({create:{width:80,height:40,channels:3,background:'#f6c41a'}}).jpeg().toBuffer();
  for(let orientation=1;orientation<=8;orientation++)for(const little of [true,false]) {
    const data=jpegWithOrientation(jpeg,orientation,little);
    // Deliberately wrong extension/MIME: use bytes to identify the raster.
    const file=new File([new Uint8Array(data)],'picture.png',{type:'image/png'});
    const doc=await PDFDocument.load(await convertImageToPdfBytes(file));
    assert.deepEqual(Buffer.from(imageStream(doc).contents),data,'Original JPEG is never recompressed');
    assert.ok(Math.abs(doc.getPage(0).getWidth()/doc.getPage(0).getHeight()-(orientation>=5?.5:2))<1e-9);
  }
});

test('image merging uses the same original-byte path and keeps PDF/image order and native image page sizes',async()=>{
  const png=await sharp({create:{width:200,height:25,channels:4,background:{r:20,g:150,b:240,alpha:.5}}}).png().toBuffer();
  const jpeg=jpegWithOrientation(await sharp(png).jpeg().toBuffer(),6);
  const pdf=await PDFDocument.create();pdf.addPage([300,400]);
  const files=[new File([new Uint8Array(png)],'1.png',{type:'image/png'}),new File([await pdf.save()],'2.pdf',{type:'application/pdf'}),new File([new Uint8Array(jpeg)],'3.jpg',{type:'image/jpeg'})];
  const merged=await PDFDocument.load(await convertMultipleFilesToSinglePdfBytes(files,true));
  assert.equal(merged.getPageCount(),3);
  assert.deepEqual(merged.getPages().map(p=>p.getSize()),[{width:200,height:25},{width:300,height:400},{width:25,height:200}]);
  assert.deepEqual(Buffer.from(imageStream(merged,2).contents),jpeg);
  assert.ok(imageStream(merged).dict.has(PDFName.of('SMask')));
});

test('browser-decoded formats use native-size lossless PNG and revoke blob URLs on success and failure',async()=>{
  const originals=['Image','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;let revoked=0,draws=0,failure=false;
  const png=await sharp({create:{width:130,height:47,channels:4,background:{r:30,g:70,b:210,alpha:.5}}}).png().toBuffer();
  try {
    URL.createObjectURL=()=> 'blob:test-image';URL.revokeObjectURL=()=>{revoked++;};
    Object.defineProperty(globalThis,'Image',{configurable:true,value:class{
      naturalWidth=130;naturalHeight=47;onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
      set src(_value:string){queueMicrotask(()=>failure?this.onerror?.():this.onload?.());}
    }});
    Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({width:0,height:0,
      getContext:()=>({drawImage:(_image:unknown,x:number,y:number)=>{assert.equal(x,0);assert.equal(y,0);draws++;}}),
      toBlob(callback:(blob:Blob)=>void,type:string){assert.equal(type,'image/png');assert.equal(this.width,130);assert.equal(this.height,47);callback(new Blob([new Uint8Array(png)],{type}));}
    })}});
    for(const format of ['webp','gif','bmp','svg']) {
      const file=new File(['browser-decodes-this'],`source.${format}`,{type:`image/${format}`});
      const doc=await PDFDocument.load(await convertImageToPdfBytes(file)),image=imageStream(doc);
      assert.ok(Math.abs(doc.getPage(0).getWidth()/doc.getPage(0).getHeight()-130/47)<1e-9);
      assert.ok(image.dict.has(PDFName.of('SMask')));assert.equal(image.dict.get(PDFName.of('Filter'))?.toString(),'/FlateDecode');
    }
    assert.equal(draws,4);assert.equal(revoked,4);
    failure=true;await assert.rejects(convertImageToPdfBytes(new File(['broken'],'broken.webp',{type:'image/webp'})),/giải mã/);
    assert.equal(revoked,5);
  } finally {
    URL.createObjectURL=create;URL.revokeObjectURL=revoke;
    for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];
  }
});
