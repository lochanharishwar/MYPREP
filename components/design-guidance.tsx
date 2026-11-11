 'use client';
import { useState } from 'react';
import { DESIGN_STARTERS, VISUAL_DESIGN_VERSION, VISUAL_DESIGN_SOURCES, appendDesignDirection } from '@/lib/visual-design';
export function DesignGuidance({direction,onChange}:{direction:string;onChange:(value:string)=>void}) {
 const [notice,setNotice]=useState('');
 return <details className="panel design-guidance"><summary>Design guidance & style starters</summary>
 <p className="small muted">Every generated image uses guidance for a clear focal point, balanced composition, product fidelity and readable requested text. Choose a starter to add direction; your brand and brief remain the source.</p>
 <div className="row" style={{flexWrap:'wrap'}}>{DESIGN_STARTERS.map(style=><button key={style.name} type="button" className="secondary-btn" onClick={()=>{try{onChange(appendDesignDirection(direction,style.direction));setNotice(style.name+' added to creative direction. No generation started.');}catch(error){setNotice(error instanceof Error?error.message:'Unable to add style.');}}}>{style.name}</button>)}</div>
 <output className="small" aria-live="polite">{notice}</output>
 <p className="small muted">Review checks the finished media for clarity, audience relevance, visual quality and platform fit. Model scores are not measured conversion predictions. This is prompt guidance, not a trained custom model.</p>
 <details><summary>Research & guide version</summary><p className="small">{VISUAL_DESIGN_VERSION}</p><ul>{VISUAL_DESIGN_SOURCES.map((url,index)=><li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{['Visual hierarchy and composition — Nielsen Norman Group','Text contrast — W3C','Image prompting — Google DeepMind'][index]}</a></li>)}</ul></details>
 </details>;
}
