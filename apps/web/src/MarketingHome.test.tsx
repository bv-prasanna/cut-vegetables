import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect} from 'vitest';
import MarketingHome,{type StoreVariant,type StoreSlot} from './MarketingHome';
const product:StoreVariant={id:'potato-10',vegetable:'Potato',preparation:'DICED',size:{kind:'numeric',value:10,unit:'mm'},imageUrl:'https://example.com/potato.jpg',pricePaisePerKg:8500,minimumGrams:500,incrementGrams:250,active:true};
const slot:StoreSlot={id:'am',label:'5 AM – 8 AM',startMinute:300,endMinute:480,cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:25,active:true};
function markup(variants:StoreVariant[]=[product],slots:StoreSlot[]=[slot]){
 return renderToStaticMarkup(<MarketingHome variants={variants} slots={slots} weekdays={[1,3,5]} frequency="WEEKLY" onSetWeekdays={()=>{}} onSetFrequency={()=>{}} onCatalogue={()=>{}} onRecurring={()=>{}} onOrders={()=>{}} onAdmin={()=>{}} onSelectProduct={()=>{}}/>);
}
describe('approved FreshPrep storefront',()=>{
 it('renders all screenshot-required major sections',()=>{
  const html=markup();
  for(const text of ['FreshPrep','Shop by Preparation','Set Up Recurring Orders','Delivery Slots','FreshPrep Rewards','Why Professional Kitchens Choose FreshPrep'])expect(html).toContain(text);
 });
 it('shows configured size, price and image alt text',()=>{
  const html=markup();
  expect(html).toContain('diced 10 mm');expect(html).toContain('₹85');expect(html).toContain('potato.jpg');
 });
 it('describes configured slot cutoff without inventing availability',()=>{
  const html=markup();expect(html).toContain('Closes previous day at 23:00');
 });
 it('makes illustrative product cards explicit when catalogue is empty',()=>{
  const html=markup([]);
  expect(html).toContain('Illustrative photo');
  expect(html).toContain('Price on request');
  expect((html.match(/class="fp-sample-mark"/g)||[])).toHaveLength(4);
 });
});
