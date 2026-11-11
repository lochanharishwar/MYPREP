import { describe,expect,it } from 'vitest';
import { appendDesignDirection,DESIGN_STARTERS } from '@/lib/visual-design';
describe('creative direction starters',()=>{
 it('preserves an existing brief when adding a style',()=>{const original='Keep the original blue package. Do not add people.';const result=appendDesignDirection(original,DESIGN_STARTERS[1].direction);expect(result.startsWith(original)).toBe(true);expect(result).toContain(DESIGN_STARTERS[1].direction);});
 it('does not duplicate a repeated starter',()=>{const direction=DESIGN_STARTERS[0].direction;expect(appendDesignDirection(direction,direction)).toBe(direction);});
 it('rejects oversized direction without silently discarding constraints',()=>{expect(()=>appendDesignDirection('a'.repeat(1990),DESIGN_STARTERS[2].direction)).toThrow('2,000');});
});
