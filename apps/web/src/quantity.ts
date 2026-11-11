/** Quantity changes must respect each SKU's minimum and incremental weight. */
export function nextQuantity(current:number,minimum:number,increment:number,direction:1|-1):number{
 if(!Number.isSafeInteger(current)||current<0||!Number.isSafeInteger(minimum)||minimum<=0||
  !Number.isSafeInteger(increment)||increment<=0)
  throw new Error('Invalid product quantity configuration');
 if(direction===1)return current===0?minimum:current+increment;
 if(current<=minimum)return 0;
 return Math.max(minimum,current-increment);
}
