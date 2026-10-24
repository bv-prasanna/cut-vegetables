import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { recurrenceSchema, slotSchema, variantSchema, type Slot, type Variant } from './domain.js';
import { isSlotBookable, validateOrderQuantities } from './scheduling.js';

export function createApp() {
  const app = new Hono();
  // Prototype storage only. Replace with PostgreSQL transactions, auth and tenant isolation before production.
  const variants = new Map<string,Variant>();
  const slots = new Map<string,Slot>();
  const rules = new Map<string, unknown>();
  app.get('/health', c => c.json({status:'ok'}));
  app.get('/catalog/variants', c => c.json([...variants.values()].filter(v=>v.active)));
  app.get('/delivery/slots', c => c.json([...slots.values()].filter(s=>s.active)));
  // ADMIN ROUTES ARE UNSAFE UNTIL AUTH / RBAC MIDDLEWARE IS ADDED; not for public deployment.
  app.post('/dev/admin/variants', zValidator('json',variantSchema), c => {
    const data=c.req.valid('json'); variants.set(data.id,data); return c.json(data,201);
  });
  app.post('/dev/admin/slots', zValidator('json',slotSchema), c => {
    const data=c.req.valid('json'); slots.set(data.id,data); return c.json(data,201);
  });
  app.post('/dev/recurrences', zValidator('json',recurrenceSchema.extend({id:z.string().min(1)})), c => {
    const data=c.req.valid('json');
    if(!slots.has(data.slotId)) return c.json({error:'Unknown slot'},422);
    const errors=validateOrderQuantities(data.items,[...variants.values()]);
    if(errors.length) return c.json({errors},422);
    if(rules.has(data.id)) return c.json({error:'Duplicate recurrence ID'},409);
    rules.set(data.id,data);
    return c.json(data,201);
  });
  app.get('/dev/recurrences', c => c.json([...rules.values()]));
  app.get('/delivery/slots/:id/availability', c => {
    const slot=slots.get(c.req.param('id'));
    if(!slot) return c.json({error:'Unknown slot'},404);
    const date=c.req.query('date') || '';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({error:'Expected YYYY-MM-DD'},400);
    try { return c.json({slotId:slot.id,date,open:isSlotBookable(date,slot,new Date())}); }
    catch {return c.json({error:'Invalid date'},400);}
  });
  return app;
}
