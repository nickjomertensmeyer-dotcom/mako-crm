import {documentFields,validDocumentLogo,type DocumentDesign} from '@/lib/document-design';
export function documentBorder(design?:DocumentDesign){return design?.color&&/^#[0-9a-f]{6}$/i.test(design.color)?design.color:'#2454ef';}
export function DocumentBranding({design}:{design?:DocumentDesign}){
 if(!design)return null;
 return <div className="document-branding">{design.logo&&validDocumentLogo(design.logo)&&<><img className="document-logo" src={design.logo} alt="Business logo"/></>}<dl className="document-extra-details">{documentFields.filter(([key])=>design[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{design[key]}</dd></div>)}</dl></div>;
}
