import {it,expect} from 'vitest';import {allowDevelopmentApi} from './dev-guard.js';
it('blocks development APIs in production mode',()=>{expect(allowDevelopmentApi('production')).toBe(false);expect(allowDevelopmentApi('development')).toBe(true);expect(allowDevelopmentApi(undefined)).toBe(true);});
