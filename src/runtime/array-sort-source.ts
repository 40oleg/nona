// Array.prototype.sort (ES2020 22.1.3.27) as a stable merge sort in the
// runtime prelude. It replaces the earlier native insertion sort, whose
// quadratic generic property traffic made 2048-element sorts time out.
// Scratch storage is kept in prototype-less objects written by plain
// assignment, which the indexed fast path serves in constant time.
// Intrinsics are captured while the prelude runs.
export const arraySortPreludeSource=String.raw`;(function(){
  'use strict';
  var defineProperty=Object.defineProperty;
  var markNative=Function.prototype.__nonaMarkNativeInternal;
  var arrayPrototype=Array.prototype;
  var mathFloor=Math.floor,mathMin=Math.min,mathMax=Math.max;
  function toLength(value){
    var number=+value;
    if(number!==number||number<=0)return 0;
    number=mathFloor(number);
    return mathMin(number,9007199254740991)
  }
  var objectCreate=Object.create;
  // Scratch lists are prototype-less objects: nothing on a prototype chain
  // can intercept their indexed stores, so plain assignment is both correct
  // and the fast indexed path (array-elements.ts).
  function list(){return objectCreate(null)}
  var sort=({sort(comparefn){
    if(comparefn!==undefined&&typeof comparefn!=='function')throw new TypeError('The comparison function must be either a function or undefined');
    if(this===undefined||this===null)throw new TypeError('Array.prototype.sort called on null or undefined');
    var object=Object(this);
    var length=toLength(object.length);
    var items=list(),count=0;
    for(var k=0;k<length;k++)if(k in object){items[count]=object[k];count++}
    var compare=function(x,y){
      if(x===undefined)return y===undefined?0:1;
      if(y===undefined)return -1;
      if(comparefn!==undefined){
        var v=+comparefn(x,y);
        return v!==v?0:v
      }
      var xs=String(x),ys=String(y);
      return xs<ys?-1:ys<xs?1:0
    };
    // Bottom-up merge sort: stable and O(n log n) comparisons.
    var source=items,target=list();
    for(var width=1;width<count;width*=2){
      for(var low=0;low<count;low+=2*width){
        var middle=mathMin(low+width,count),high=mathMin(low+2*width,count),i=low,j=middle,out=low;
        while(i<middle&&j<high){
          if(compare(source[j],source[i])<0){target[out++]=source[j++]}
          else target[out++]=source[i++];
        }
        while(i<middle)target[out++]=source[i++];
        while(j<high)target[out++]=source[j++];
      }
      var swap=source;source=target;target=swap
    }
    var index=0;
    for(;index<count;index++)object[index]=source[index];
    for(;index<length;index++)delete object[index];
    return object
  }}).sort;
  defineProperty(sort,'name',{value:'sort',configurable:true});
  markNative(sort);
  defineProperty(arrayPrototype,'sort',{value:sort});
})();`;
