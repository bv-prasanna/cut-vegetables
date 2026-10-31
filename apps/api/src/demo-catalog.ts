import { type Variant, type Slot } from './domain.js';
type Prep=Variant['preparation'];
type Size=number|string;
type Spec={name:string;baseRupees:number;image:string;cuts:[Prep,Size][]};
const images={
 potato:'photo-1518977676601-b53f82aba655',onion:'photo-1508747703725-719777637510',carrot:'photo-1445282768818-728615cc910a',cabbage:'photo-1594282486552-05b4d80fbb9f',
 general:'photo-1540420773420-3366772f4999',tomato:'photo-1546470427-e5f89d3dc1ce',broccoli:'photo-1459411621453-7b03977f4bfc',pepper:'photo-1563565375-f3fdfdbefa83'
};
const image=(key:keyof typeof images)=>'https://images.unsplash.com/'+images[key]+'?auto=format&fit=crop&w=720&q=80';
const specs:Spec[]=[
 {name:'Potato',baseRupees:42,image:image('potato'),cuts:[['DICED',5],['DICED',10],['DICED',20],['SLICED',5]]},
 {name:'Onion',baseRupees:52,image:image('onion'),cuts:[['CHOPPED',5],['CHOPPED',10],['CHOPPED',20],['SLICED',2]]},
 {name:'Carrot',baseRupees:58,image:image('carrot'),cuts:[['GRATED','fine'],['GRATED','coarse'],['DICED',10],['JULIENNE',3]]},
 {name:'Cabbage',baseRupees:44,image:image('cabbage'),cuts:[['SHREDDED','thin'],['SHREDDED','thick'],['CHOPPED',10],['CHOPPED',20]]},
 {name:'French Beans',baseRupees:82,image:image('general'),cuts:[['CHOPPED',5],['CHOPPED',10],['CHOPPED',20],['SLICED',5]]},
 {name:'Tomato',baseRupees:55,image:image('tomato'),cuts:[['DICED',10],['DICED',20],['SLICED',5],['CHOPPED','fine']]},
 {name:'Green Capsicum',baseRupees:85,image:image('pepper'),cuts:[['DICED',5],['DICED',10],['DICED',20],['JULIENNE',5]]},
 {name:'Beetroot',baseRupees:59,image:image('general'),cuts:[['GRATED','fine'],['GRATED','coarse'],['DICED',10],['SLICED',3]]},
 {name:'Cucumber',baseRupees:45,image:image('general'),cuts:[['DICED',10],['DICED',20],['SLICED',3],['JULIENNE',5]]},
 {name:'Radish',baseRupees:47,image:image('general'),cuts:[['GRATED','fine'],['GRATED','coarse'],['SLICED',3],['DICED',10]]},
 {name:'Cauliflower',baseRupees:80,image:image('general'),cuts:[['CHOPPED',10],['CHOPPED',20],['CHOPPED','coarse'],['SLICED',5]]},
 {name:'Broccoli',baseRupees:115,image:image('broccoli'),cuts:[['CHOPPED',10],['CHOPPED',20],['CHOPPED','coarse'],['SLICED',5]]},
 {name:'Bottle Gourd',baseRupees:49,image:image('general'),cuts:[['DICED',10],['DICED',20],['SLICED',5],['GRATED','coarse']]},
 {name:'Ridge Gourd',baseRupees:59,image:image('general'),cuts:[['DICED',10],['DICED',20],['SLICED',5],['CHOPPED',10]]},
 {name:'Bitter Gourd',baseRupees:73,image:image('general'),cuts:[['SLICED',3],['SLICED',5],['CHOPPED',10],['CHOPPED',20]]},
 {name:'Ash Gourd',baseRupees:48,image:image('general'),cuts:[['DICED',10],['DICED',20],['SLICED',5],['GRATED','coarse']]},
 {name:'Pumpkin',baseRupees:50,image:image('general'),cuts:[['DICED',10],['DICED',20],['SLICED',5],['GRATED','coarse']]},
 {name:'Okra',baseRupees:75,image:image('general'),cuts:[['SLICED',3],['SLICED',5],['CHOPPED',10],['CHOPPED',20]]},
 {name:'Spinach',baseRupees:63,image:image('general'),cuts:[['CHOPPED','fine'],['CHOPPED','coarse'],['SHREDDED','thin'],['SHREDDED','thick']]},
 {name:'Coriander Leaves',baseRupees:125,image:image('general'),cuts:[['CHOPPED','fine'],['CHOPPED','medium'],['CHOPPED','coarse'],['SHREDDED','thin']]},
 {name:'Green Chilli',baseRupees:102,image:image('pepper'),cuts:[['CHOPPED','fine'],['CHOPPED',5],['SLICED',3],['SLICED',5]]},
 {name:'Ginger',baseRupees:140,image:image('general'),cuts:[['GRATED','fine'],['GRATED','coarse'],['JULIENNE',2],['DICED',5]]},
 {name:'Garlic',baseRupees:170,image:image('general'),cuts:[['CHOPPED','fine'],['CHOPPED','coarse'],['SLICED',2],['DICED',5]]},
 {name:'Raw Banana',baseRupees:68,image:image('general'),cuts:[['DICED',10],['DICED',20],['SLICED',3],['SLICED',5]]},
 {name:'Drumstick',baseRupees:90,image:image('general'),cuts:[['CHOPPED',20],['CHOPPED',30],['SLICED',10],['SLICED',20]]}
];
function slug(text:string){return text.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
export function buildDemoCatalogue():Variant[]{
 return specs.flatMap(({name,baseRupees,image,cuts})=>cuts.map(([preparation,size],i)=>{
  const numeric=typeof size==='number';
  return {
   id:'sample-'+slug(name)+'-'+slug(preparation)+'-'+slug(String(size))+(numeric?'mm':''),
   vegetable:name,preparation,
   size:numeric?{kind:'numeric' as const,value:size,unit:'mm' as const}:{kind:'label' as const,value:size as 'fine'|'medium'|'coarse'|'thin'|'thick'},
   imageUrl:image,pricePaisePerKg:(baseRupees+([0,4,7,3][i]))*100,
   minimumGrams:500,incrementGrams:250,active:true
  };
 }));
}
export function buildDemoSlots():Slot[]{
 return [
  {id:'sample-morning',label:'5 AM – 8 AM',startMinute:300,endMinute:480,cutoffDayOffset:1,cutoffMinute:1380,capacityOrders:80,active:true},
  {id:'sample-afternoon',label:'2 PM – 5 PM',startMinute:840,endMinute:1020,cutoffDayOffset:0,cutoffMinute:660,capacityOrders:60,active:true},
  {id:'sample-evening',label:'5 PM – 8 PM',startMinute:1020,endMinute:1200,cutoffDayOffset:0,cutoffMinute:840,capacityOrders:40,active:true}
 ];
}
