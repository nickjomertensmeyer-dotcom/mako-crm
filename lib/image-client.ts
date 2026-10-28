'use client';
export async function preparePhoto(file:File,contain=false){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5000000)throw new Error('Choose a PNG, JPEG, or WebP image under 5 MB.');
  const bitmap=await createImageBitmap(file);try{
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=384;const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable in this browser.');
    if(contain){const scale=Math.min(384/bitmap.width,384/bitmap.height);const width=bitmap.width*scale,height=bitmap.height*scale;context.drawImage(bitmap,(384-width)/2,(384-height)/2,width,height);}
    else{const side=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,384,384);}
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Unable to prepare your photo.')),'image/webp',.82));
    if(blob.type!=='image/webp'||blob.size>250000)throw new Error('This image could not be resized. Try another photo.');return blob;
  }finally{bitmap.close();}
}
