import {describe,it,expect} from 'vitest';
import {createApp} from './app.js';
const request=(app:ReturnType<typeof createApp>,path:string,method='GET',body?:unknown)=>app.request(path,{method,headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
describe('marketing management in local development',()=>{
 it('publishes, sorts, filters, and deletes hero slides',async()=>{
  const app=createApp();
  const first={id:'one',eyebrow:'PREPARED DAILY',headline:'Fresh food',description:'Cut vegetables',imageUrl:'https://example.org/prep.jpg',active:true,sortOrder:2};
  const second={...first,id:'two',headline:'Next banner',sortOrder:1};
  expect((await request(app,'/dev/admin/slides','POST',first)).status).toBe(201);
  expect((await request(app,'/dev/admin/slides','POST',second)).status).toBe(201);
  expect((await request(app,'/dev/admin/slides','POST',second)).status).toBe(409);
  const list=await (await request(app,'/home/slides')).json() as {id:string}[];
  expect(list.map(x=>x.id)).toEqual(['two','one']);
  expect((await request(app,'/dev/admin/slides/two','DELETE')).status).toBe(200);
  expect((await request(app,'/dev/admin/slides/two','DELETE')).status).toBe(404);
 });
 it('rejects invalid image URLs and unsupported content',async()=>{
  const app=createApp();
  expect((await request(app,'/dev/admin/slides','POST',{id:'invalid',eyebrow:'a',headline:'b',description:'',imageUrl:'not-a-url',active:true,sortOrder:0})).status).not.toBe(201);
 });
 it('announcements can be published and deleted',async()=>{
  const app=createApp();
  const a={id:'delivery',title:'Holiday delivery',body:'Please order early',active:true};
  expect((await request(app,'/dev/admin/announcements','POST',a)).status).toBe(201);
  expect((await request(app,'/home/announcements')).status).toBe(200);
  expect((await request(app,'/dev/admin/announcements/delivery','DELETE')).status).toBe(200);
  expect(await (await request(app,'/home/announcements')).json()).toEqual([]);
 });
});
