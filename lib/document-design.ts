export const documentFields = [
 ['business_address','Business address',500], ['business_email','Business email',254],
 ['business_phone','Business phone',80], ['business_website','Website',200],
 ['billing_address','Bill-to address',500], ['service_address','Service / shipping address',500],
 ['reference','PO / reference number',120], ['service_period','Service period',120],
 ['payment_terms','Payment terms',500], ['footer','Footer message',300],
] as const;
export type DocumentDesign = {color?:string;logo?:string} & Partial<Record<typeof documentFields[number][0],string>>;
export function validDocumentLogo(value:string){return !value || value.length<=350000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(value);}
export function validateDocumentDesign(value:DocumentDesign):string {
 if(value.color&&!/^#[0-9a-f]{6}$/i.test(value.color))return 'Choose a valid border color.';
 if(!validDocumentLogo(value.logo||''))return 'Upload a PNG, JPEG, or WebP logo using the logo picker.';
 for(const [key,label,max] of documentFields)if(typeof value[key]!=='undefined'&&(typeof value[key]!=='string'||value[key]!.length>max))return label+' is too long.';
 if(value.business_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.business_email))return 'Enter a complete business email address.';
 return '';
}
