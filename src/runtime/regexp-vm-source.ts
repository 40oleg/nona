// This source is compiled by Nona itself for the native RegExp fallback.
// It deliberately uses only language features implemented by the frontend.
import {regexpUnicodeData} from './regexp-unicode-data.js';

export const regexpVmSource=String.raw`(function(){
  var unicodeData=@@UNICODE_DATA@@;
  var rangeCache={};
  function propertyRanges(name){
    if(typeof rangeCache[name]==='object')return rangeCache[name];
    var index=unicodeData.names[name];
    if(typeof index!=='number')throw new SyntaxError('Invalid Unicode property');
    var encoded=unicodeData.values[index];
    var ranges=[];
    for(var i=0;i<encoded.length;i+=12)ranges.push([parseInt(encoded.slice(i,i+6),16),parseInt(encoded.slice(i+6,i+12),16)]);
    rangeCache[name]=ranges;
    return ranges
  }
  function propertyMatch(ranges,point){
    var low=0,high=ranges.length-1;
    while(low<=high){var middle=(low+high)>>1,range=ranges[middle];if(point<range[0])high=middle-1;else if(point>range[1])low=middle+1;else return true}
    return false
  }
  function compile(pattern,flags){
    var at=0,groups=0,names=[];
    function error(){throw new SyntaxError('Invalid regular expression')}
    function digit(c){return c>='0'&&c<='9'}
    function decimal(){
      var n=0,seen=false;
      while(at<pattern.length&&digit(pattern[at])){seen=true;n=n*10+(pattern.charCodeAt(at)-48);at++}
      return seen?n:-1
    }
    function escaped(){
      if(at>=pattern.length)error();
      var c=pattern[at++];
      if((c==='p'||c==='P')&&flags.indexOf('u')>=0){
        if(pattern[at++]!=='{')error();
        var begin=at;
        while(at<pattern.length&&pattern[at]!=='}')at++;
        if(at===begin||pattern[at]!=='}')error();
        var property=pattern.slice(begin,at++);
        return {kind:'property',value:propertyRanges(property),negated:c==='P'}
      }
      if(c==='d'||c==='D'||c==='w'||c==='W'||c==='s'||c==='S')return {kind:'classEscape',value:c};
      if(c==='b'||c==='B')return {kind:'boundary',value:c};
      if(c==='n')return {kind:'char',value:'\n'};
      if(c==='r')return {kind:'char',value:'\r'};
      if(c==='t')return {kind:'char',value:'\t'};
      if(c==='v')return {kind:'char',value:'\v'};
      if(c==='f')return {kind:'char',value:'\f'};
      if(c==='0')return {kind:'char',value:'\0'};
      if(c==='c'){
        var control=pattern.charCodeAt(at);
        if(control>=65&&control<=90||control>=97&&control<=122){at++;return {kind:'char',value:String.fromCharCode(control%32)}}
        if(flags.indexOf('u')>=0)error();
        return {kind:'char',value:'c'}
      }
      if(c==='x'||c==='u'){
        if(c==='u'&&flags.indexOf('u')>=0&&pattern[at]==='{'){
          at++;
          var codePoint=0,digits=0;
          while(at<pattern.length&&pattern[at]!=='}'){
            var hex=pattern.charCodeAt(at++);
            if(hex>=48&&hex<=57)hex-=48;
            else if(hex>=65&&hex<=70)hex-=55;
            else if(hex>=97&&hex<=102)hex-=87;
            else error();
            codePoint=codePoint*16+hex;
            digits++;
            if(digits>6||codePoint>0x10ffff)error()
          }
          if(digits===0||pattern[at]!=='}')error();
          at++;
          return {kind:'char',value:String.fromCodePoint(codePoint)}
        }
        var count=c==='x'?2:4,n=0;
        if(flags.indexOf('u')<0){
          var valid=true;
          for(var probe=0;probe<count;probe++){
            var digitCode=pattern.charCodeAt(at+probe);
            if(!(digitCode>=48&&digitCode<=57||digitCode>=65&&digitCode<=70||digitCode>=97&&digitCode<=102))valid=false
          }
          if(!valid)return {kind:'char',value:c}
        }
        for(var j=0;j<count;j++){
          if(at>=pattern.length)error();
          var k=pattern.charCodeAt(at++);
          if(k>=48&&k<=57)k-=48;
          else if(k>=65&&k<=70)k-=55;
          else if(k>=97&&k<=102)k-=87;
          else error();
          n=n*16+k
        }
        return {kind:'char',value:String.fromCharCode(n)}
      }
      if(c==='k'&&pattern[at]==='<'){
        if(flags.indexOf('u')<0&&pattern.indexOf('(?<')<0)return {kind:'char',value:'k'};
        at++;
        var start=at;
        while(at<pattern.length&&pattern[at]!=='>'&&pattern[at]!=='\\')at++;
        if(at===start||pattern[at]!=='>')error();
        var name=pattern.slice(start,at++);
        return {kind:'namedBackref',value:name}
      }
      if(c>='1'&&c<='9'){
        var number=c.charCodeAt(0)-48;
        while(at<pattern.length&&digit(pattern[at]))number=number*10+(pattern.charCodeAt(at++)-48);
        return {kind:'backref',value:number}
      }
      return {kind:'char',value:c}
    }
    function atom(){
      if(at>=pattern.length)error();
      var c=pattern[at++];
      if(c==='\\')return escaped();
      if(c==='.')return {kind:'dot'};
      if(c==='^'||c==='$')return {kind:'anchor',value:c};
      if(c==='('){
        var capture=0,name=undefined,look=undefined;
        if(pattern[at]==='?'&&pattern[at+1]===':')at+=2;
        else if(pattern[at]==='?'&&(pattern[at+1]==='='||pattern[at+1]==='!')){
          look={behind:false,positive:pattern[at+1]==='='};at+=2
        }
        else if(pattern[at]==='?'&&pattern[at+1]==='<'&&(pattern[at+2]==='='||pattern[at+2]==='!')){
          look={behind:true,positive:pattern[at+2]==='='};at+=3
        }
        else{
          if(pattern[at]==='?'&&pattern[at+1]==='<'){
            at+=2;
            var start=at;
            while(at<pattern.length&&pattern[at]!=='>'&&pattern[at]!=='\\')at++;
            if(at===start||pattern[at]!=='>')error();
            name=pattern.slice(start,at++);
            for(var i=0;i<names.length;i++)if(names[i].name===name)error()
          }
          capture=++groups;
          if(name!==undefined)names.push({name:name,index:capture})
        }
        var inner=disjunction();
        if(pattern[at]!==')')error();
        at++;
        if(look!==undefined)return {kind:'look',value:inner,behind:look.behind,positive:look.positive};
        return {kind:'group',value:inner,capture:capture}
      }
      if(c==='['){
        var start=at,escapedClass=false;
        while(at<pattern.length){
          var k=pattern[at++];
          if(k===']'&&!escapedClass)return {kind:'class',value:pattern.slice(start,at-1)};
          if(k==='\\'&&!escapedClass)escapedClass=true;
          else escapedClass=false
        }
        error()
      }
      if(c==='*'||c==='+'||c==='?'||(flags.indexOf('u')>=0&&(c==='{'||c==='}')))error();
      if(flags.indexOf('u')>=0&&c.charCodeAt(0)>=0xd800&&c.charCodeAt(0)<=0xdbff&&at<pattern.length){
        var trail=pattern.charCodeAt(at);
        if(trail>=0xdc00&&trail<=0xdfff)c+=pattern[at++]
      }
      return {kind:'char',value:c}
    }
    function sequence(){
      var items=[];
      while(at<pattern.length&&pattern[at]!==')'&&pattern[at]!=='|'){
        var node=atom(),c=pattern[at],min=0,max=-1,quantified=false;
        if(c==='*'){min=0;max=Infinity;quantified=true;at++}
        else if(c==='+'){min=1;max=Infinity;quantified=true;at++}
        else if(c==='?'){min=0;max=1;quantified=true;at++}
        else if(c==='{'){
          var save=at;at++;
          min=decimal();
          if(min<0){at=save}
          else{
            max=min;
            if(pattern[at]===','){at++;max=decimal();if(max<0)max=Infinity}
            if(pattern[at]!=='}')error();
            at++;if(max<min)error();quantified=true
          }
        }
        if(quantified){
          var lazy=pattern[at]==='?';
          if(lazy)at++;
          node={kind:'repeat',value:node,min:min,max:max,lazy:lazy}
        }
        items.push(node)
      }
      return {kind:'sequence',value:items}
    }
    function disjunction(){
      var branches=[sequence()];
      while(pattern[at]==='|'){at++;branches.push(sequence())}
      return branches.length===1?branches[0]:{kind:'alternative',value:branches}
    }
    var tree=disjunction();
    if(at!==pattern.length)error();
    return {tree:tree,groups:groups,flags:flags,names:names}
  }
  function copy(caps){
    var out=[];
    for(var i=0;i<caps.length;i++)out[i]=caps[i];
    return out
  }
  function clear(node,caps){
    if(node.kind==='group'){
      if(node.capture!==0){caps[node.capture*2]=undefined;caps[node.capture*2+1]=undefined}
      clear(node.value,caps)
    }else if(node.kind==='sequence'||node.kind==='alternative'){
      for(var i=0;i<node.value.length;i++)clear(node.value[i],caps)
    }else if(node.kind==='repeat'||node.kind==='look')clear(node.value,caps)
  }
  function execute(compiled,input,start,sticky){
    var flags=compiled.flags,ignore=flags.indexOf('i')>=0,dotAll=flags.indexOf('s')>=0,multiline=flags.indexOf('m')>=0,steps=0;
    function same(a,b){return ignore?a.toLowerCase()===b.toLowerCase():a===b}
    function word(c){
      if(c===undefined)return false;
      var n=c.charCodeAt(0);
      return n>=48&&n<=57||n>=65&&n<=90||n>=97&&n<=122||n===95
    }
    function escapedClass(kind,c){
      var n=c.charCodeAt(0),yes=false;
      if(kind==='d'||kind==='D')yes=n>=48&&n<=57;
      else if(kind==='w'||kind==='W')yes=word(c);
      else yes=c===' '||c==='\t'||c==='\r'||c==='\n'||c==='\v'||c==='\f'||c==='\u00a0';
      return kind==='D'||kind==='W'||kind==='S'?!yes:yes
    }
    function classMatch(body,c){
      var invert=body[0]==='^',i=invert?1:0,yes=false;
      while(i<body.length){
        var first=body[i++];
        if(first==='\\'&&i<body.length){
          first=body[i++];
          if((first==='p'||first==='P')&&flags.indexOf('u')>=0){
            if(body[i++]!=='{')throw new SyntaxError('Invalid Unicode property');
            var begin=i;
            while(i<body.length&&body[i]!=='}')i++;
            if(i===begin||body[i]!=='}')throw new SyntaxError('Invalid Unicode property');
            var code=c.codePointAt(0),has=propertyMatch(propertyRanges(body.slice(begin,i++)),code);
            if(first==='P')has=!has;
            if(has)yes=true;
            continue
          }
          if(first==='d'||first==='D'||first==='w'||first==='W'||first==='s'||first==='S'){
            if(escapedClass(first,c))yes=true;
            continue
          }
          if(first==='n')first='\n';
          else if(first==='r')first='\r';
          else if(first==='t')first='\t'
        }
        if(i+1<body.length&&body[i]==='-'){
          i++;
          var last=body[i++];
          if(last==='\\'&&i<body.length)last=body[i++];
          var x=ignore?c.toLowerCase():c,lo=ignore?first.toLowerCase():first,hi=ignore?last.toLowerCase():last;
          if(x>=lo&&x<=hi)yes=true
        }else if(same(c,first))yes=true
      }
      return invert?!yes:yes
    }
    function run(node,pos,caps,next){
      if(++steps>100000)throw new RangeError('RegExp backtracking limit');
      var k=node.kind;
      if(k==='sequence'){
        function part(i,p,a){
          if(i===node.value.length)return next(p,a);
          return run(node.value[i],p,a,function(end,updated){return part(i+1,end,updated)})
        }
        return part(0,pos,caps)
      }
      if(k==='alternative'){
        for(var i=0;i<node.value.length;i++){
          var result=run(node.value[i],pos,copy(caps),next);
          if(result!==null)return result
        }
        return null
      }
      if(k==='group'){
        return run(node.value,pos,caps,function(end,updated){
          if(node.capture===0)return next(end,updated);
          var changed=copy(updated);
          changed[node.capture*2]=pos;
          changed[node.capture*2+1]=end;
          return next(end,changed)
        })
      }
      if(k==='look'){
        var seen=null;
        if(node.behind){
          for(var begin=pos;begin>=0;begin--){
            seen=run(node.value,begin,copy(caps),function(end,updated){
              return end===pos?{captures:updated}:null
            });
            if(seen!==null)break
          }
        }else seen=run(node.value,pos,copy(caps),function(end,updated){return {captures:updated}});
        if(node.positive)return seen===null?null:next(pos,seen.captures);
        return seen===null?next(pos,caps):null
      }
      if(k==='repeat'){
        var simple=node.value.kind;
        if(simple==='char'||simple==='dot'||simple==='class'||simple==='classEscape'||simple==='property'){
          var positions=[pos],end=pos;
          while(positions.length-1<node.max){
            var one=run(node.value,end,caps,function(after){return {end:after}});
            steps--;
            if(one===null||one.end===end)break;
            end=one.end;positions.push(end)
          }
          if(positions.length-1<node.min)return null;
          if(node.lazy){
            for(var count=node.min;count<positions.length;count++){
              var result=next(positions[count],caps);
              if(result!==null)return result
            }
          }else{
            for(var count=positions.length-1;count>=node.min;count--){
              var result=next(positions[count],caps);
              if(result!==null)return result
            }
          }
          return null
        }
        function repeat(count,p,a){
          function more(){
            if(count>=node.max)return null;
            var fresh=copy(a);clear(node.value,fresh);
            return run(node.value,p,fresh,function(end,updated){
              if(end===p)return count+1>=node.min?next(end,updated):null;
              return repeat(count+1,end,updated)
            })
          }
          if(node.lazy){
            if(count>=node.min){var early=next(p,copy(a));if(early!==null)return early}
            return more()
          }
          var later=more();
          if(later!==null)return later;
          return count>=node.min?next(p,a):null
        }
        return repeat(0,pos,caps)
      }
      if(k==='anchor'){
        if(node.value==='^'){
          if(pos===0||multiline&&('\n\r\u2028\u2029'.indexOf(input[pos-1])>=0))return next(pos,caps)
        }else if(pos===input.length||multiline&&('\n\r\u2028\u2029'.indexOf(input[pos])>=0))return next(pos,caps);
        return null
      }
      if(k==='boundary'){
        var boundary=word(input[pos-1])!==word(input[pos]);
        return boundary===(node.value==='b')?next(pos,caps):null
      }
      if(k==='backref'||k==='namedBackref'){
        var index=node.value;
        if(k==='namedBackref'){
          index=0;
          for(var i=0;i<compiled.names.length;i++)if(compiled.names[i].name===node.value)index=compiled.names[i].index
        }
        if(index<1||index>compiled.groups)throw new SyntaxError('Invalid backreference');
        var begin=caps[index*2],end=caps[index*2+1];
        if(begin===undefined)return next(pos,caps);
        var length=end-begin;
        if(pos+length>input.length)return null;
        return same(input.slice(pos,pos+length),input.slice(begin,end))?next(pos+length,caps):null
      }
      if(pos>=input.length)return null;
      var current=input[pos],matched=false,width=1;
      if(flags.indexOf('u')>=0&&current.charCodeAt(0)>=0xd800&&current.charCodeAt(0)<=0xdbff&&pos+1<input.length){
        var trail=input.charCodeAt(pos+1);
        if(trail>=0xdc00&&trail<=0xdfff)width=2
      }
      if(k==='char'){
        width=node.value.length;
        matched=pos+width<=input.length&&same(input.slice(pos,pos+width),node.value)
      }
      else if(k==='dot')matched=dotAll||'\n\r\u2028\u2029'.indexOf(current)<0;
      else if(k==='classEscape')matched=escapedClass(node.value,current);
      else if(k==='class')matched=classMatch(node.value,input.slice(pos,pos+width));
      else if(k==='property'){
        var point=current.charCodeAt(0);
        if(width===2)point=0x10000+(point-0xd800)*1024+(input.charCodeAt(pos+1)-0xdc00);
        matched=propertyMatch(node.value,point);
        if(node.negated)matched=!matched
      }
      return matched?next(pos+width,caps):null
    }
    var unicode=flags.indexOf('u')>=0;
    if(unicode&&start>0&&start<input.length){
      var low=input.charCodeAt(start),high=input.charCodeAt(start-1);
      if(low>=0xdc00&&low<=0xdfff&&high>=0xd800&&high<=0xdbff)start--
    }
    for(var candidate=start;candidate<=input.length;candidate++){
      var caps=[];
      for(var i=0;i<=compiled.groups;i++){caps.push(undefined);caps.push(undefined)}
      var result=run(compiled.tree,candidate,caps,function(end,updated){return {end:end,captures:updated}});
      if(result!==null){result.start=candidate;return result}
      if(sticky)break
      if(unicode&&candidate+1<input.length){
        var high=input.charCodeAt(candidate),low=input.charCodeAt(candidate+1);
        if(high>=0xd800&&high<=0xdbff&&low>=0xdc00&&low<=0xdfff)candidate++
      }
    }
    return null
  }
  return {compile:compile,execute:execute}
})()`.replace('@@UNICODE_DATA@@',regexpUnicodeData);

export const regexpVmPreludeSource='var __nonaRegexpVm=function(re,input,start,sticky,pattern,flags){"use strict";if(__nonaRegexpVm.core===undefined)__nonaRegexpVm.core='+regexpVmSource+String.raw`;
    var vm=__nonaRegexpVm.core;
    var compiled=vm.compile(pattern,flags);
    var matched=vm.execute(compiled,input,start,sticky);
    var globalOrSticky=flags.indexOf('g')>=0||flags.indexOf('y')>=0;
    if(matched===null){
      if(globalOrSticky)re.lastIndex=0;
      return null
    }
    if(globalOrSticky)re.lastIndex=matched.end;
    var result=[input.slice(matched.start,matched.end)];
    for(var i=1;i<=compiled.groups;i++){
      var begin=matched.captures[i*2],end=matched.captures[i*2+1];
      result.push(begin===undefined?undefined:input.slice(begin,end))
    }
    Object.defineProperty(result,'index',{value:matched.start,writable:true,enumerable:true,configurable:true});
    Object.defineProperty(result,'input',{value:input,writable:true,enumerable:true,configurable:true});
    if(compiled.names.length){
      var groups=Object.create(null);
      for(var i=0;i<compiled.names.length;i++){
        var named=compiled.names[i],begin=matched.captures[named.index*2],end=matched.captures[named.index*2+1];
        groups[named.name]=begin===undefined?undefined:input.slice(begin,end)
      }
      Object.defineProperty(result,'groups',{value:groups,writable:true,enumerable:true,configurable:true})
    }else Object.defineProperty(result,'groups',{value:undefined,writable:true,enumerable:true,configurable:true});
    return result
};
Object.defineProperty(RegExp.prototype,Symbol.match,{value:function(string){
  'use strict';
  if(typeof string==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var input=String(string);
  var flags=String(this.flags);
  var global=flags.indexOf('g')>=0,unicode=flags.indexOf('u')>=0;
  if(!global){
    var single=this.exec(input);
    if(single!==null&&typeof single!=='object'&&typeof single!=='function')throw new TypeError('RegExp exec returned invalid result');
    return single
  }
  this.lastIndex=0;
  var matches=[];
  while(true){
    var result=this.exec(input);
    if(result===null)return matches.length===0?null:matches;
    if(typeof result!=='object'&&typeof result!=='function')throw new TypeError('RegExp exec returned invalid result');
    var value=String(result[0]);
    matches.push(value);
    if(value===''){
      var index=this.lastIndex;
      if(unicode&&index+1<input.length){
        var first=input.charCodeAt(index),second=input.charCodeAt(index+1);
        this.lastIndex=index+(first>=0xd800&&first<=0xdbff&&second>=0xdc00&&second<=0xdfff?2:1)
      }else this.lastIndex=index+1
    }
  }
},writable:true,configurable:true});
Object.defineProperty(RegExp.prototype[Symbol.match],'name',{value:'[Symbol.match]',configurable:true});
Object.defineProperty(String.prototype,'match',{value:({match(regexp){
  'use strict';
  if(this===null||this===undefined)throw new TypeError('String.prototype.match called on null or undefined');
  if(regexp!==null&&(typeof regexp==='object'||typeof regexp==='function')){
    var matcher=regexp[Symbol.match];
    if(matcher!==null&&matcher!==undefined){
      if(typeof matcher!=='function')throw new TypeError('Symbol.match is not callable');
      return matcher.call(regexp,String(this))
    }
  }
  var rx=new RegExp(regexp);
  return rx[Symbol.match](String(this))
}}).match,writable:true,configurable:true});
Object.defineProperty(String.prototype.match,'name',{value:'match',configurable:true});
Object.defineProperty(RegExp.prototype,Symbol.search,{value:({[Symbol.search](string){
  'use strict';
  if(this===null||this===undefined)throw new TypeError('Invalid RegExp receiver');
  if(typeof string==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var input=String(string),previous=this.lastIndex;
  if(!Object.is(previous,0))this.lastIndex=0;
  var result=this.exec(input);
  if(result!==null&&typeof result!=='object'&&typeof result!=='function')throw new TypeError('RegExp exec returned invalid result');
  if(!Object.is(this.lastIndex,previous))this.lastIndex=previous;
  return result===null?-1:result.index
}})[Symbol.search],writable:true,configurable:true});
Object.defineProperty(String.prototype,'search',{value:({search(regexp){
  'use strict';
  if(this===null||this===undefined)throw new TypeError('String.prototype.search called on null or undefined');
  if(regexp!==null&&(typeof regexp==='object'||typeof regexp==='function')){
    var searcher=regexp[Symbol.search];
    if(searcher!==null&&searcher!==undefined){
      if(typeof searcher!=='function')throw new TypeError('Symbol.search is not callable');
      return searcher.call(regexp,String(this))
    }
  }
  var rx=new RegExp(regexp);
  return rx[Symbol.search](String(this))
}}).search,writable:true,configurable:true});
Object.defineProperty(RegExp.prototype,Symbol.replace,{value:({[Symbol.replace](string,replaceValue){
  'use strict';
  if(this===null||this===undefined)throw new TypeError('Invalid RegExp receiver');
  if(typeof string==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var input=String(string),functional=typeof replaceValue==='function';
  var replacement=undefined;
  if(!functional){
    if(typeof replaceValue==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
    replacement=String(replaceValue)
  }
  var flags=String(this.flags);
  var global=Boolean(this.global),unicode=global?Boolean(this.unicode):false;
  if(global)this.lastIndex=0;
  var results=[];
  while(true){
    var result=this.exec(input);
    if(result===null)break;
    if(typeof result!=='object'&&typeof result!=='function')throw new TypeError('RegExp exec returned invalid result');
    results.push(result);
    if(!global)break;
    var matched=String(result[0]);
    if(matched===''){
      var index=Number(this.lastIndex);
      if(index!==index||index<0)index=0;
      else if(index>9007199254740991)index=9007199254740991;
      else index=Math.floor(index);
      if(unicode&&index+1<input.length){
        var first=input.charCodeAt(index),second=input.charCodeAt(index+1);
        this.lastIndex=index+(first>=0xd800&&first<=0xdbff&&second>=0xdc00&&second<=0xdfff?2:1)
      }else this.lastIndex=index+1
    }
  }
  var accumulated='',nextSourcePosition=0;
  for(var i=0;i<results.length;i++){
    var item=results[i],match=String(item[0]),position=Number(item.index);
    if(position!==position||position<0)position=0;
    else if(position>input.length)position=input.length;
    else position=Math.floor(position);
    var captures=[],length=Number(item.length);
    if(length!==length||length<0)length=0;
    else length=Math.floor(length);
    for(var j=1;j<length;j++){
      var capture=item[j];
      if(capture!==undefined){
        if(typeof capture==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
        capture=String(capture)
      }
      captures.push(capture)
    }
    var groups=item.groups,value='';
    if(!functional&&groups===null)throw new TypeError('Invalid named capture groups');
    if(functional){
      var args=[match];
      for(var j=0;j<captures.length;j++)args.push(captures[j]);
      args.push(position);args.push(input);
      if(groups!==undefined)args.push(groups);
      value=String(replaceValue.apply(undefined,args))
    }else{
      for(var j=0;j<replacement.length;j++){
        var c=replacement[j];
        if(c!=='$'||j+1>=replacement.length){value+=c;continue}
        var next=replacement[j+1];
        if(next==='$'){value+='$';j++;continue}
        if(next==='&'){value+=match;j++;continue}
        if(next.charCodeAt(0)===96){value+=input.slice(0,position);j++;continue}
        if(next==="'"){value+=input.slice(position+match.length);j++;continue}
        if(next==='<'&&groups!==undefined){
          var end=replacement.indexOf('>',j+2);
          if(end>=0){
            var named=groups[replacement.slice(j+2,end)];
            if(named!==undefined)value+=String(named);
            j=end;continue
          }
        }
        var digit=next.charCodeAt(0)-48;
        if(digit>=0&&digit<=9){
          var number=digit,used=1;
          if(j+2<replacement.length){
            var secondDigit=replacement.charCodeAt(j+2)-48;
            if(secondDigit>=0&&secondDigit<=9&&digit*10+secondDigit<=captures.length){number=digit*10+secondDigit;used=2}
          }
          if(number>0&&number<=captures.length){
            var capture=captures[number-1];
            if(capture!==undefined)value+=String(capture);
            j+=used;continue
          }
        }
        value+='$'
      }
    }
    if(position>=nextSourcePosition){
      accumulated+=input.slice(nextSourcePosition,position)+value;
      nextSourcePosition=position+match.length
    }
  }
  return accumulated+input.slice(nextSourcePosition)
}})[Symbol.replace],writable:true,configurable:true});
Object.defineProperty(RegExp.prototype,Symbol.split,{value:({[Symbol.split](string,limit){
  'use strict';
  if(this===null||(typeof this!=='object'&&typeof this!=='function'))throw new TypeError('Invalid RegExp receiver');
  if(typeof string==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var input=String(string);
  var ctor=this.constructor,species;
  if(ctor===undefined)species=RegExp;
  else{
    if(ctor===null||(typeof ctor!=='object'&&typeof ctor!=='function'))throw new TypeError('Invalid RegExp constructor');
    species=ctor[Symbol.species];
    if(species===null||species===undefined)species=RegExp
  }
  var flagValue=this.flags;
  if(typeof flagValue==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var flags=String(flagValue),unicode=flags.indexOf('u')>=0;
  var stickyFlags=flags.indexOf('y')>=0?flags:flags+'y';
  var splitter=new species(this,stickyFlags);
  var length=input.length,result=[],max=limit===undefined?4294967295:limit>>>0;
  if(max===0)return result;
  if(length===0){
    if(splitter.exec(input)!==null)return result;
    result[0]=input;return result
  }
  var p=0,q=0;
  while(q<length){
    splitter.lastIndex=q;
    var match=splitter.exec(input);
    if(match===null){
      var step=1;
      if(unicode&&q+1<length){
        var first=input.charCodeAt(q),second=input.charCodeAt(q+1);
        if(first>=0xd800&&first<=0xdbff&&second>=0xdc00&&second<=0xdfff)step=2
      }
      q+=step;continue
    }
    if(typeof match!=='object'&&typeof match!=='function')throw new TypeError('RegExp exec returned invalid result');
    var e=Number(splitter.lastIndex);
    if(e!==e||e<0)e=0;
    else if(e>9007199254740991)e=9007199254740991;
    else e=Math.floor(e);
    if(e>length)e=length;
    if(e===p){
      var step=1;
      if(unicode&&q+1<length){
        var first=input.charCodeAt(q),second=input.charCodeAt(q+1);
        if(first>=0xd800&&first<=0xdbff&&second>=0xdc00&&second<=0xdfff)step=2
      }
      q+=step;continue
    }
    result[result.length]=input.slice(p,q);
    if(result.length===max)return result;
    p=e;
    var captures=Number(match.length);
    if(captures!==captures||captures<0)captures=0;
    else captures=Math.floor(captures);
    for(var i=1;i<captures;i++){
      result[result.length]=match[i];
      if(result.length===max)return result
    }
    q=p
  }
  result[result.length]=input.slice(p,length);
  return result
}})[Symbol.split],writable:true,configurable:true});`;
