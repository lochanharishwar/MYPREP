import { describe,it,expect } from 'vitest';
import {campaignProgress,rankObservations} from '@/lib/campaign-progress';
import type {Entity,MetricObservation} from '@/lib/contracts';
const record=(kind:string,brand:string,payload:unknown):Entity<unknown>=>({id:crypto.randomUUID(),kind,brand_id:brand,workspace_id:'w',payload,created_at:'',updated_at:''});
describe('connected campaign progress',()=>{
 it('keeps other brands, failed posts and unqualified media out of completion counts',()=>{
 const rows=[record('dna','other',{}),record('content','a',{status:'qualified',review:{score:8.69}}),record('schedule','a',{status:'failed'}),record('schedule','a',{status:'verifying'})];
 const steps=campaignProgress(rows,'a');expect(steps.map(s=>s.count)).toEqual([0,0,0,1,0,0]);
 });
 it('counts actual records without assuming downstream completion',()=>{expect(campaignProgress([record('dna','a',{})],'a').map(s=>s.count)).toEqual([1,0,0,0,0,0]);});
 it('deduplicates observations before ranking and preserves zero versus missing',()=>{
 const obs=(postId:string,observedAt:string,value:number|null)=>record('metrics','a',{postId,platform:'x',observedAt,metrics:{views:value},definitions:{}}) as Entity<MetricObservation>;
 const rows=[obs('1','2026-01-01T00:00:00Z',100),obs('1','2026-01-02T00:00:00Z',0),obs('2','2026-01-02T00:00:00Z',null),obs('3','bad-date',500)];
 expect(rankObservations(rows,'views').map(r=>r.payload.metrics.views)).toEqual([0]);
 });
});