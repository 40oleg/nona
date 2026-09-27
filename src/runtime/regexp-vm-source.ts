// This source is compiled by Nona itself for the native RegExp fallback.
// It deliberately uses only language features implemented by the frontend.
import {regexpUnicodeData} from './regexp-unicode-data.js';

export const regexpVmSource=String.raw`(function(){
  var intrinsic=typeof __nonaRegexpVm==='function'?__nonaRegexpVm:null;
  var safeSlice=intrinsic?intrinsic.replaceSlice:String.prototype.slice;
  var safeIndexOf=intrinsic?intrinsic.replaceIndexOf:String.prototype.indexOf;
  var safeCharCodeAt=intrinsic?intrinsic.replaceCharCodeAt:String.prototype.charCodeAt;
  function append(array,value){Object.defineProperty(array,array.length,{value:value,writable:true,enumerable:true,configurable:true})}
  function slice(string,start,end){return safeSlice.call(string,start,end)}
  function indexOf(string,value){return safeIndexOf.call(string,value)}
  function charCodeAt(string,index){return safeCharCodeAt.call(string,index)}
  var unicodeData=@@UNICODE_DATA@@;
  var rangeCache={};
  function propertyRanges(name){
    if(typeof rangeCache[name]==='object')return rangeCache[name];
    var index=unicodeData.names[name];
    if(typeof index!=='number')throw new SyntaxError('Invalid Unicode property');
    var encoded=unicodeData.values[index];
    var ranges=[];
    for(var i=0;i<encoded.length;i+=12)append(ranges,[parseInt(slice(encoded,i,i+6),16),parseInt(slice(encoded,i+6,i+12),16)]);
    rangeCache[name]=ranges;
    return ranges
  }
  function propertyMatch(ranges,point){
    var low=0,high=ranges.length-1;
    while(low<=high){var middle=(low+high)>>1,range=ranges[middle];if(point<range[0])high=middle-1;else if(point>range[1])low=middle+1;else return true}
    return false
  }
  var foldReverse={},foldReady=false;
  function foldPoint(point){
    var encoded=unicodeData.folds,low=0,high=encoded.length/12-1;
    while(low<=high){
      var middle=(low+high)>>1,offset=middle*12,source=parseInt(slice(encoded,offset,offset+6),16);
      if(point<source)high=middle-1;
      else if(point>source)low=middle+1;
      else return parseInt(slice(encoded,offset+6,offset+12),16)
    }
    return point
  }
  function foldAlternates(point){
    if(!foldReady){
      var encoded=unicodeData.folds;
      for(var i=0;i<encoded.length;i+=12){
        var source=parseInt(slice(encoded,i,i+6),16),target=foldPoint(parseInt(slice(encoded,i+6,i+12),16));
        var list=foldReverse[target];
        if(list===undefined){list=[];foldReverse[target]=list}
        append(list,source)
      }
      foldReady=true
    }
    return foldReverse[point]
  }
  function legacyCanonical(point){
    var upper=String.fromCharCode(point).toUpperCase();
    if(upper.length!==1)return point;
    var result=charCodeAt(upper,0);
    return point>=128&&result<128?point:result
  }
  function compile(pattern,flags){
    var at=0,groups=0,names=[],totalGroups=0,inClass=false;
    for(var scan=0;scan<pattern.length;scan++){
      var mark=pattern[scan];
      if(mark==='\\'){scan++;continue}
      if(inClass){if(mark===']')inClass=false;continue}
      if(mark==='['){inClass=true;continue}
      if(mark==='('&&!(pattern[scan+1]==='?'&&(pattern[scan+2]===':'||pattern[scan+2]==='='||pattern[scan+2]==='!'||pattern[scan+2]==='<'&&(pattern[scan+3]==='='||pattern[scan+3]==='!'))))totalGroups++
    }
    function error(){throw new SyntaxError('Invalid regular expression')}
    function digit(c){return c>='0'&&c<='9'}
    function hex(c){
      if(c===undefined)return -1;
      var n=charCodeAt(c,0);
      return n>=48&&n<=57?n-48:n>=65&&n<=70?n-55:n>=97&&n<=102?n-87:-1
    }
    function groupName(){
      var name='';
      while(at<pattern.length&&pattern[at]!=='>'){
        var character=pattern[at++];
        if(character==='\\'){
          if(pattern[at++]!=='u')error();
          var value=0,count=0,braced=pattern[at]==='{';
          if(braced){
            at++;
            while(at<pattern.length&&pattern[at]!=='}'){
              var digitValue=hex(pattern[at++]);if(digitValue<0)error();
              value=value*16+digitValue;count++;if(value>0x10ffff)error()
            }
            if(count===0||pattern[at]!=='}')error();at++
          }else{
            for(var j=0;j<4;j++){
              var digitValue=hex(pattern[at++]);if(digitValue<0)error();
              value=value*16+digitValue
            }
          }
          character=String.fromCodePoint(value)
        }
        name+=character
      }
      if(pattern[at]!=='>')error();at++;
      if(name.length===0)error();
      var starts=propertyRanges('ID_Start'),continues=propertyRanges('ID_Continue');
      for(var i=0;i<name.length;){
        var point=name.codePointAt(i),valid;
        if(i===0)valid=point===36||point===95||propertyMatch(starts,point);
        else valid=point===36||point===95||point===0x200c||point===0x200d||propertyMatch(continues,point);
        if(!valid)error();
        i+=point>0xffff?2:1
      }
      return name
    }
    function parseClass(body){
      var inverted=body[0]==='^',cursor=inverted?1:0,unicode=indexOf(flags,'u')>=0,items=[];
      function unit(){
        var c=body[cursor++],point=charCodeAt(c,0);
        if(c!=='\\'){
          if(unicode&&point>=0xd800&&point<=0xdbff&&cursor<body.length){
            var low=charCodeAt(body,cursor);
            if(low>=0xdc00&&low<=0xdfff){cursor++;point=0x10000+(point-0xd800)*1024+(low-0xdc00)}
          }
          return {point:point,set:false}
        }
        if(cursor>=body.length)error();
        c=body[cursor++];
        if(c==='d'||c==='D'||c==='w'||c==='W'||c==='s'||c==='S')return {point:0,set:true,escape:c};
        if((c==='p'||c==='P')&&unicode){
          if(body[cursor++]!=='{')error();
          var begin=cursor;
          while(cursor<body.length&&body[cursor]!=='}')cursor++;
          if(begin===cursor||body[cursor]!=='}')error();
          var ranges=propertyRanges(slice(body,begin,cursor++));
          return {point:0,set:true,property:ranges,negated:c==='P'}
        }
        if(c==='x'||c==='u'){
          var count=c==='x'?2:4,value=0;
          if(c==='u'&&unicode&&body[cursor]==='{'){
            cursor++;count=0;
            while(cursor<body.length&&body[cursor]!=='}'){
              var d=hex(body[cursor++]);if(d<0)error();
              value=value*16+d;count++;if(value>0x10ffff)error()
            }
            if(count===0||body[cursor]!=='}')error();
            cursor++;return {point:value,set:false}
          }
          for(var j=0;j<count;j++){
            var d=hex(body[cursor+j]);
            if(d<0){if(unicode)error();return {point:charCodeAt(c,0),set:false}}
            value=value*16+d
          }
          cursor+=count;return {point:value,set:false}
        }
        if(c==='n')point=10;else if(c==='r')point=13;else if(c==='t')point=9;
        else if(c==='v')point=11;else if(c==='f')point=12;else if(c==='b')point=8;
        else if(c>='0'&&c<='7'){
          if(unicode&&c!=='0')error();
          if(unicode&&body[cursor]>='0'&&body[cursor]<='9')error();
          point=charCodeAt(c,0)-48;
          var limit=point<=3?3:2,used=1;
          while(!unicode&&used<limit&&body[cursor]>='0'&&body[cursor]<='7'){
            point=point*8+charCodeAt(body,cursor++)-48;used++
          }
        }
        else if(c==='c'&&cursor<body.length){
          var control=charCodeAt(body,cursor);
          if(control>=65&&control<=90||control>=97&&control<=122){cursor++;point=control%32}
          else if(unicode)error();else point=99
        }
        else{
          if(unicode&&indexOf('^$\\.*+?()[]{}|/-',c)<0)error();
          point=charCodeAt(c,0)
        }
        return {point:point,set:false}
      }
      function codePointUnit(){
        var first=unit();
        if(unicode&&!first.set&&first.point>=0xd800&&first.point<=0xdbff&&cursor<body.length&&body[cursor]!=='-'){
          var saved=cursor,second=unit();
          if(!second.set&&second.point>=0xdc00&&second.point<=0xdfff)
            first.point=0x10000+(first.point-0xd800)*1024+(second.point-0xdc00);
          else cursor=saved
        }
        return first
      }
      while(cursor<body.length){
        var first=codePointUnit();
        if(body[cursor]==='-'&&cursor+1<body.length){
          cursor++;
          var last=codePointUnit();
          if(first.set||last.set){
            if(unicode)error();
            append(items,first);append(items,{point:45,set:false});append(items,last)
          }else{
            if(first.point>last.point)error();
            append(items,{from:first.point,to:last.point,range:true})
          }
        }else append(items,first)
      }
      return {inverted:inverted,items:items}
    }
    function decimal(){
      var n=0,seen=false;
      while(at<pattern.length&&digit(pattern[at])){seen=true;n=n*10+(charCodeAt(pattern,at)-48);at++}
      return seen?n:-1
    }
    function escaped(){
      if(at>=pattern.length)error();
      var c=pattern[at++];
      if((c==='p'||c==='P')&&indexOf(flags,'u')>=0){
        if(pattern[at++]!=='{')error();
        var begin=at;
        while(at<pattern.length&&pattern[at]!=='}')at++;
        if(at===begin||pattern[at]!=='}')error();
        var property=slice(pattern,begin,at++);
        return {kind:'property',value:propertyRanges(property),negated:c==='P'}
      }
      if(c==='d'||c==='D'||c==='w'||c==='W'||c==='s'||c==='S')return {kind:'classEscape',value:c};
      if(c==='b'||c==='B')return {kind:'boundary',value:c};
      if(c==='n')return {kind:'char',value:'\n'};
      if(c==='r')return {kind:'char',value:'\r'};
      if(c==='t')return {kind:'char',value:'\t'};
      if(c==='v')return {kind:'char',value:'\v'};
      if(c==='f')return {kind:'char',value:'\f'};
      if(c==='0'){
        if(indexOf(flags,'u')>=0&&digit(pattern[at]))error();
        var octal=0,used=1;
        while(indexOf(flags,'u')<0&&used<3&&pattern[at]>='0'&&pattern[at]<='7'){
          octal=octal*8+charCodeAt(pattern,at++)-48;used++
        }
        return {kind:'char',value:String.fromCharCode(octal)}
      }
      if(c==='c'){
        var control=charCodeAt(pattern,at);
        if(control>=65&&control<=90||control>=97&&control<=122){at++;return {kind:'char',value:String.fromCharCode(control%32)}}
        if(indexOf(flags,'u')>=0)error();
        return {kind:'char',value:'c'}
      }
      if(c==='x'||c==='u'){
        if(c==='u'&&indexOf(flags,'u')>=0&&pattern[at]==='{'){
          at++;
          var codePoint=0,digits=0;
          while(at<pattern.length&&pattern[at]!=='}'){
            var hex=charCodeAt(pattern,at++);
            if(hex>=48&&hex<=57)hex-=48;
            else if(hex>=65&&hex<=70)hex-=55;
            else if(hex>=97&&hex<=102)hex-=87;
            else error();
            codePoint=codePoint*16+hex;
            digits++;
            if(codePoint>0x10ffff)error()
          }
          if(digits===0||pattern[at]!=='}')error();
          at++;
          return {kind:'char',value:String.fromCodePoint(codePoint)}
        }
        var count=c==='x'?2:4,n=0;
        if(indexOf(flags,'u')<0){
          var valid=true;
          for(var probe=0;probe<count;probe++){
            var digitCode=charCodeAt(pattern,at+probe);
            if(!(digitCode>=48&&digitCode<=57||digitCode>=65&&digitCode<=70||digitCode>=97&&digitCode<=102))valid=false
          }
          if(!valid)return {kind:'char',value:c}
        }
        for(var j=0;j<count;j++){
          if(at>=pattern.length)error();
          var k=charCodeAt(pattern,at++);
          if(k>=48&&k<=57)k-=48;
          else if(k>=65&&k<=70)k-=55;
          else if(k>=97&&k<=102)k-=87;
          else error();
          n=n*16+k
        }
        return {kind:'char',value:String.fromCharCode(n)}
      }
      if(c==='k'&&pattern[at]==='<'){
        if(indexOf(flags,'u')<0&&indexOf(pattern,'(?<')<0)return {kind:'char',value:'k'};
        at++;
        var name=groupName();
        return {kind:'namedBackref',value:name}
      }
      if(c>='1'&&c<='9'){
        var number=charCodeAt(c,0)-48,probe=at;
        while(probe<pattern.length&&digit(pattern[probe]))number=number*10+(charCodeAt(pattern,probe++)-48);
        if(number<=totalGroups){at=probe;return {kind:'backref',value:number}}
        if(indexOf(flags,'u')>=0)error();
        if(c==='8'||c==='9')return {kind:'char',value:c};
        var octal=charCodeAt(c,0)-48,limit=octal<=3?3:2,used=1;
        while(used<limit&&pattern[at]>='0'&&pattern[at]<='7'){
          octal=octal*8+charCodeAt(pattern,at++)-48;used++
        }
        return {kind:'char',value:String.fromCharCode(octal)}
      }
      if(indexOf(flags,'u')>=0&&indexOf('^$\\.*+?()[]{}|/',c)<0)error();
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
            name=groupName();
            for(var i=0;i<names.length;i++)if(names[i].name===name)error()
          }
          capture=++groups;
          if(name!==undefined)append(names,{name:name,index:capture})
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
          if(k===']'&&!escapedClass){var body=slice(pattern,start,at-1);return {kind:'class',value:parseClass(body)}}
          if(k==='\\'&&!escapedClass)escapedClass=true;
          else escapedClass=false
        }
        error()
      }
      if(c==='*'||c==='+'||c==='?'||(indexOf(flags,'u')>=0&&(c==='{'||c==='}')))error();
      if(indexOf(flags,'u')>=0&&charCodeAt(c,0)>=0xd800&&charCodeAt(c,0)<=0xdbff&&at<pattern.length){
        var trail=charCodeAt(pattern,at);
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
        append(items,node)
      }
      return {kind:'sequence',value:items}
    }
    function disjunction(){
      var branches=[sequence()];
      while(pattern[at]==='|'){at++;append(branches,sequence())}
      return branches.length===1?branches[0]:{kind:'alternative',value:branches}
    }
    var tree=disjunction();
    if(at!==pattern.length)error();
    function validateReferences(node){
      if(node.kind==='backref'){
        if(indexOf(flags,'u')>=0&&node.value>groups)error()
      }else if(node.kind==='namedBackref'){
        var found=false;
        for(var i=0;i<names.length;i++)if(names[i].name===node.value)found=true;
        if(!found)error()
      }else if(node.kind==='group'||node.kind==='look'||node.kind==='repeat')validateReferences(node.value);
      else if(node.kind==='sequence'||node.kind==='alternative'){
        for(var i=0;i<node.value.length;i++)validateReferences(node.value[i])
      }
    }
    validateReferences(tree);
    return {tree:tree,groups:groups,flags:flags,names:names}
  }
  function copy(caps){
    var out=[];
    for(var i=0;i<caps.length;i++)append(out,caps[i]);
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
    var flags=compiled.flags,ignore=indexOf(flags,'i')>=0,unicode=indexOf(flags,'u')>=0,dotAll=indexOf(flags,'s')>=0,multiline=indexOf(flags,'m')>=0,steps=0;
    function same(a,b){
      if(!ignore)return a===b;
      if(!unicode){
        if(a.length!==b.length)return false;
        for(var unit=0;unit<a.length;unit++)if(legacyCanonical(charCodeAt(a,unit))!==legacyCanonical(charCodeAt(b,unit)))return false;
        return true
      }
      var left=0,right=0;
      while(left<a.length&&right<b.length){
        var first=a.codePointAt(left),second=b.codePointAt(right);
        if(foldPoint(first)!==foldPoint(second))return false;
        left+=first>0xffff?2:1;right+=second>0xffff?2:1
      }
      return left===a.length&&right===b.length
    }
    function word(c){
      if(c===undefined)return false;
      var n=unicode?c.codePointAt(0):charCodeAt(c,0);
      if(ignore&&unicode)n=foldPoint(n);
      return n>=48&&n<=57||n>=65&&n<=90||n>=97&&n<=122||n===95
    }
    function escapedClass(kind,c){
      var n=charCodeAt(c,0),yes=false;
      if(kind==='d'||kind==='D')yes=n>=48&&n<=57;
      else if(kind==='w'||kind==='W')yes=word(c);
      else yes=c===' '||c==='\t'||c==='\r'||c==='\n'||c==='\v'||c==='\f'||c==='\u00a0';
      return kind==='D'||kind==='W'||kind==='S'?!yes:yes
    }
    function propertyContains(ranges,point,negated){
      var present=propertyMatch(ranges,point);
      if(negated?!present:present)return true;
      if(!ignore||!unicode)return false;
      var canonical=foldPoint(point);
      present=propertyMatch(ranges,canonical);
      if(negated?!present:present)return true;
      var alternates=foldAlternates(canonical);
      if(alternates!==undefined)for(var i=0;i<alternates.length;i++){
        present=propertyMatch(ranges,alternates[i]);
        if(negated?!present:present)return true
      }
      return false
    }
    function classMatch(spec,c){
      var yes=false,point=c.codePointAt(0);
      for(var i=0;i<spec.items.length;i++){
        var item=spec.items[i];
        if(item.range){
          if(ignore&&unicode){
            var canonical=foldPoint(point),alternates=foldAlternates(canonical);
            if(canonical>=item.from&&canonical<=item.to)yes=true;
            if(alternates!==undefined)for(var j=0;j<alternates.length;j++)if(alternates[j]>=item.from&&alternates[j]<=item.to)yes=true
          }else{
            var current=ignore?legacyCanonical(point):point;
            var low=ignore?legacyCanonical(item.from):item.from;
            var high=ignore?legacyCanonical(item.to):item.to;
            if(current>=low&&current<=high)yes=true
          }
        }else if(item.set){
          if(item.escape!==undefined){if(escapedClass(item.escape,c))yes=true}
          else if(propertyContains(item.property,point,item.negated))yes=true
        }else if(same(c,String.fromCodePoint(item.point)))yes=true
      }
      return spec.inverted?!yes:yes
    }
    function run(node,pos,caps,next,direction){
      if(++steps>100000)throw new RangeError('RegExp backtracking limit');
      var k=node.kind;
      if(k==='sequence'){
        function part(i,p,a){
          if(i===node.value.length)return next(p,a);
          var partIndex=direction<0?node.value.length-1-i:i;
          return run(node.value[partIndex],p,a,function(end,updated){return part(i+1,end,updated)},direction)
        }
        return part(0,pos,caps)
      }
      if(k==='alternative'){
        for(var i=0;i<node.value.length;i++){
          var result=run(node.value[i],pos,copy(caps),next,direction);
          if(result!==null)return result
        }
        return null
      }
      if(k==='group'){
        return run(node.value,pos,caps,function(end,updated){
          if(node.capture===0)return next(end,updated);
          var changed=copy(updated);
          changed[node.capture*2]=direction<0?end:pos;
          changed[node.capture*2+1]=direction<0?pos:end;
          return next(end,changed)
        },direction)
      }
      if(k==='look'){
        var seen=null;
        if(node.behind)seen=run(node.value,pos,copy(caps),function(end,updated){return {captures:updated}},-1);
        else seen=run(node.value,pos,copy(caps),function(end,updated){return {captures:updated}},1);
        if(node.positive)return seen===null?null:next(pos,seen.captures);
        return seen===null?next(pos,caps):null
      }
      if(k==='repeat'){
        var simple=node.value.kind;
        if(simple==='char'||simple==='dot'||simple==='class'||simple==='classEscape'||simple==='property'){
          var positions=[pos],end=pos;
          while(positions.length-1<node.max){
            var one=run(node.value,end,caps,function(after){return {end:after}},direction);
            steps--;
            if(one===null||one.end===end)break;
            end=one.end;append(positions,end)
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
            },direction)
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
          if(pos===0||multiline&&(indexOf('\n\r\u2028\u2029',input[pos-1])>=0))return next(pos,caps)
        }else if(pos===input.length||multiline&&(indexOf('\n\r\u2028\u2029',input[pos])>=0))return next(pos,caps);
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
        var refStart=direction<0?pos-length:pos;
        if(refStart<0||refStart+length>input.length)return null;
        return same(slice(input,refStart,refStart+length),slice(input,begin,end))?next(pos+direction*length,caps):null
      }
      if(direction<0?pos<=0:pos>=input.length)return null;
      var current=input[direction<0?pos-1:pos],matched=false,width=1;
      if(indexOf(flags,'u')>=0){
        if(direction<0&&pos>=2){
          var low=charCodeAt(input,pos-1),high=charCodeAt(input,pos-2);
          if(low>=0xdc00&&low<=0xdfff&&high>=0xd800&&high<=0xdbff)width=2
        }else if(direction>0&&charCodeAt(current,0)>=0xd800&&charCodeAt(current,0)<=0xdbff&&pos+1<input.length){
          var trail=charCodeAt(input,pos+1);
          if(trail>=0xdc00&&trail<=0xdfff)width=2
        }
      }
      if(k==='char'){
        width=node.value.length;
        var from=direction<0?pos-width:pos;
        matched=from>=0&&from+width<=input.length&&same(slice(input,from,from+width),node.value)
      }
      else if(k==='dot')matched=dotAll||indexOf('\n\r\u2028\u2029',current)<0;
      else if(k==='classEscape')matched=escapedClass(node.value,current);
      else if(k==='class')matched=classMatch(node.value,slice(input,direction<0?pos-width:pos,direction<0?pos:pos+width));
      else if(k==='property'){
        var point=charCodeAt(input,direction<0?pos-width:pos);
        if(width===2)point=0x10000+(point-0xd800)*1024+(charCodeAt(input,direction<0?pos-1:pos+1)-0xdc00);
        matched=propertyContains(node.value,point,node.negated)
      }
      return matched?next(pos+direction*width,caps):null
    }
    if(unicode&&start>0&&start<input.length){
      var low=charCodeAt(input,start),high=charCodeAt(input,start-1);
      if(low>=0xdc00&&low<=0xdfff&&high>=0xd800&&high<=0xdbff)start--
    }
    for(var candidate=start;candidate<=input.length;candidate++){
      var caps=[];
      for(var i=0;i<=compiled.groups;i++){append(caps,undefined);append(caps,undefined)}
      var result=run(compiled.tree,candidate,caps,function(end,updated){return {end:end,captures:updated}},1);
      if(result!==null){result.start=candidate;return result}
      if(sticky)break
      if(unicode&&candidate+1<input.length){
        var high=charCodeAt(input,candidate),low=charCodeAt(input,candidate+1);
        if(high>=0xd800&&high<=0xdbff&&low>=0xdc00&&low<=0xdfff)candidate++
      }
    }
    return null
  }
  return {compile:compile,execute:execute}
})()`.replace('@@UNICODE_DATA@@',regexpUnicodeData);

export const regexpVmPreludeSource='var __nonaRegexpVm=function(re,input,start,sticky,pattern,flags){"use strict";if(__nonaRegexpVm.core===undefined)__nonaRegexpVm.core='+regexpVmSource+String.raw`;
    var vm=__nonaRegexpVm.core;
    if(re===undefined){vm.compile(pattern,flags);return undefined}
    var compiled=vm.compile(pattern,flags);
    var matched=vm.execute(compiled,input,start,sticky);
    var globalOrSticky=__nonaRegexpVm.replaceIndexOf.call(flags,'g')>=0||__nonaRegexpVm.replaceIndexOf.call(flags,'y')>=0;
    if(matched===null){
      if(globalOrSticky)re.lastIndex=0;
      return null
    }
    if(globalOrSticky)re.lastIndex=matched.end;
    var result=[__nonaRegexpVm.replaceSlice.call(input,matched.start,matched.end)];
    for(var i=1;i<=compiled.groups;i++){
      var begin=matched.captures[i*2],end=matched.captures[i*2+1];
      Object.defineProperty(result,result.length,{value:begin===undefined?undefined:__nonaRegexpVm.replaceSlice.call(input,begin,end),writable:true,enumerable:true,configurable:true})
    }
    Object.defineProperty(result,'index',{value:matched.start,writable:true,enumerable:true,configurable:true});
    Object.defineProperty(result,'input',{value:input,writable:true,enumerable:true,configurable:true});
    if(compiled.names.length){
      var groups=Object.create(null);
      for(var i=0;i<compiled.names.length;i++){
        var named=compiled.names[i],begin=matched.captures[named.index*2],end=matched.captures[named.index*2+1];
        groups[named.name]=begin===undefined?undefined:__nonaRegexpVm.replaceSlice.call(input,begin,end)
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
      return matcher.call(regexp,this)
    }
  }
  var rx=new RegExp(regexp);
  return rx[Symbol.match](this)
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
      return searcher.call(regexp,this)
    }
  }
  var rx=new RegExp(regexp);
  return rx[Symbol.search](this)
}}).search,writable:true,configurable:true});
Object.defineProperty(RegExp.prototype,Symbol.replace,{value:({[Symbol.replace](string,replaceValue){
  'use strict';
  var safe=__nonaRegexpVm;
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
    Object.defineProperty(results,results.length,{value:result,writable:true,enumerable:true,configurable:true});
    if(!global)break;
    var matched=String(result[0]);
    if(matched===''){
      var index=Number(this.lastIndex);
      if(index!==index||index<0)index=0;
      else if(index>9007199254740991)index=9007199254740991;
      else index=Math.floor(index);
      if(unicode&&index+1<input.length){
        var first=safe.replaceCharCodeAt.call(input,index),second=safe.replaceCharCodeAt.call(input,index+1);
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
      Object.defineProperty(captures,captures.length,{value:capture,writable:true,enumerable:true,configurable:true})
    }
    var groups=item.groups,value='';
    if(!functional&&groups===null)throw new TypeError('Invalid named capture groups');
    if(functional){
      var args=[match];
      for(var j=0;j<captures.length;j++)Object.defineProperty(args,args.length,{value:captures[j],writable:true,enumerable:true,configurable:true});
      Object.defineProperty(args,args.length,{value:position,writable:true,enumerable:true,configurable:true});
      Object.defineProperty(args,args.length,{value:input,writable:true,enumerable:true,configurable:true});
      if(groups!==undefined)Object.defineProperty(args,args.length,{value:groups,writable:true,enumerable:true,configurable:true});
      value=String(safe.replaceApply.call(replaceValue,undefined,args))
    }else{
      for(var j=0;j<replacement.length;j++){
        var c=replacement[j];
        if(c!=='$'||j+1>=replacement.length){value+=c;continue}
        var next=replacement[j+1];
        if(next==='$'){value+='$';j++;continue}
        if(next==='&'){value+=match;j++;continue}
        if(safe.replaceCharCodeAt.call(next,0)===96){value+=safe.replaceSlice.call(input,0,position);j++;continue}
        if(next==="'"){value+=safe.replaceSlice.call(input,position+match.length);j++;continue}
        if(next==='<'&&groups!==undefined){
          var end=safe.replaceIndexOf.call(replacement,'>',j+2);
          if(end>=0){
            var named=groups[safe.replaceSlice.call(replacement,j+2,end)];
            if(named!==undefined)value+=String(named);
            j=end;continue
          }
        }
        var digit=safe.replaceCharCodeAt.call(next,0)-48;
        if(digit>=0&&digit<=9){
          var number=digit,used=1;
          if(j+2<replacement.length){
            var secondDigit=safe.replaceCharCodeAt.call(replacement,j+2)-48;
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
      accumulated+=safe.replaceSlice.call(input,nextSourcePosition,position)+value;
      nextSourcePosition=position+match.length
    }
  }
  return accumulated+safe.replaceSlice.call(input,nextSourcePosition)
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
}})[Symbol.split],writable:true,configurable:true});
__nonaRegexpVm.matchAllPrototype=Object.create(Object.getPrototypeOf([][Symbol.iterator]()));
(function(){
var matchAllSlots=new WeakMap();
Object.defineProperty(__nonaRegexpVm.matchAllPrototype,'next',{value:({next(){
  'use strict';
  var slots=matchAllSlots.get(this);
  if(slots===undefined)throw new TypeError('Invalid RegExp String Iterator');
  if(slots.done)return {value:undefined,done:true};
  var matcher=slots.matcher,input=slots.input;
  var result=matcher.exec(input);
  if(result===null){slots.done=true;return {value:undefined,done:true}}
  if(typeof result!=='object'&&typeof result!=='function')throw new TypeError('RegExp exec returned invalid result');
  if(!slots.global)slots.done=true;
  else if(String(result[0])===''){
    var index=Number(matcher.lastIndex);
    if(index!==index||index<0)index=0;
    else if(index>9007199254740991)index=9007199254740991;
    else index=Math.floor(index);
    if(slots.unicode&&index+1<input.length){
      var first=input.charCodeAt(index),second=input.charCodeAt(index+1);
      matcher.lastIndex=index+(first>=0xd800&&first<=0xdbff&&second>=0xdc00&&second<=0xdfff?2:1)
    }else matcher.lastIndex=index+1
  }
  return {value:result,done:false}
}}).next,writable:true,configurable:true});
Object.defineProperty(__nonaRegexpVm.matchAllPrototype,Symbol.iterator,{value:({[Symbol.iterator](){return this}})[Symbol.iterator],writable:true,configurable:true});
Object.defineProperty(__nonaRegexpVm.matchAllPrototype,Symbol.toStringTag,{value:'RegExp String Iterator',configurable:true});
Object.defineProperty(RegExp.prototype,Symbol.matchAll,{value:({[Symbol.matchAll](string){
  'use strict';
  if(this===null||(typeof this!=='object'&&typeof this!=='function'))throw new TypeError('Invalid RegExp receiver');
  if(typeof string==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var input=String(string),ctor=this.constructor,species;
  if(ctor===undefined)species=RegExp;
  else{
    if(ctor===null||(typeof ctor!=='object'&&typeof ctor!=='function'))throw new TypeError('Invalid RegExp constructor');
    species=ctor[Symbol.species];
    if(species===null||species===undefined)species=RegExp
  }
  var flagValue=this.flags;
  if(typeof flagValue==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var flags=String(flagValue),matcher=new species(this,flags);
  var index=Number(this.lastIndex);
  if(index!==index||index<0)index=0;
  else if(index>9007199254740991)index=9007199254740991;
  else index=Math.floor(index);
  matcher.lastIndex=index;
  var iterator=Object.create(__nonaRegexpVm.matchAllPrototype);
  matchAllSlots.set(iterator,{matcher:matcher,input:input,global:flags.indexOf('g')>=0,unicode:flags.indexOf('u')>=0,done:false});
  return iterator
}})[Symbol.matchAll],writable:true,configurable:true});
})();
Object.defineProperty(String.prototype,'matchAll',{value:({matchAll(regexp){
  'use strict';
  if(this===null||this===undefined)throw new TypeError('String.prototype.matchAll called on null or undefined');
  if(regexp!==null&&(typeof regexp==='object'||typeof regexp==='function')){
    var marker=regexp[Symbol.match],isRegExp=marker===undefined?regexp instanceof RegExp:Boolean(marker);
    if(isRegExp){
      var flags=String(regexp.flags);
      if(flags.indexOf('g')<0)throw new TypeError('RegExp must have global flag')
    }
    var method=regexp[Symbol.matchAll];
    if(method!==null&&method!==undefined){
      if(typeof method!=='function')throw new TypeError('Symbol.matchAll is not callable');
      return method.call(regexp,this)
    }
  }
  var input=String(this),rx=new RegExp(regexp,'g');
  return rx[Symbol.matchAll](input)
}}).matchAll,writable:true,configurable:true});
Object.defineProperty(String.prototype,'replaceAll',{value:({replaceAll(searchValue,replaceValue){
  'use strict';
  if(this===null||this===undefined)throw new TypeError('String.prototype.replaceAll called on null or undefined');
  if(searchValue!==null&&(typeof searchValue==='object'||typeof searchValue==='function')){
    var marker=searchValue[Symbol.match],isRegExp=marker===undefined?searchValue instanceof RegExp:Boolean(marker);
    if(isRegExp){
      var flags=String(searchValue.flags);
      if(flags.indexOf('g')<0)throw new TypeError('RegExp must have global flag')
    }
    var hook=searchValue[Symbol.replace];
    if(hook!==null&&hook!==undefined){
      if(typeof hook!=='function')throw new TypeError('Symbol.replace is not callable');
      return hook.call(searchValue,this,replaceValue)
    }
  }
  var input=String(this);
  if(typeof searchValue==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
  var search=String(searchValue),functional=typeof replaceValue==='function',replacement='';
  if(!functional){
    if(typeof replaceValue==='symbol')throw new TypeError('Cannot convert a Symbol value to a string');
    replacement=String(replaceValue)
  }
  var result='',end=0,position=input.indexOf(search,0);
  while(position>=0){
    result+=input.slice(end,position);
    var value='';
    if(functional)value=String(replaceValue(search,position,input));
    else{
      for(var i=0;i<replacement.length;i++){
        var c=replacement[i];
        if(c!=='$'||i+1>=replacement.length){value+=c;continue}
        var next=replacement[i+1];
        if(next==='$'){value+='$';i++;continue}
        if(next==='&'){value+=search;i++;continue}
        if(next.charCodeAt(0)===96){value+=input.slice(0,position);i++;continue}
        if(next==="'"){value+=input.slice(position+search.length);i++;continue}
        value+='$'
      }
    }
    result+=value;
    end=position+search.length;
    var nextPosition=position+(search.length===0?1:search.length);
    position=nextPosition>input.length?-1:input.indexOf(search,nextPosition)
  }
  return result+input.slice(end)
}}).replaceAll,writable:true,configurable:true});
__nonaRegexpVm.replaceSlice=String.prototype.slice;
__nonaRegexpVm.replaceIndexOf=String.prototype.indexOf;
__nonaRegexpVm.replaceCharCodeAt=String.prototype.charCodeAt;
__nonaRegexpVm.replaceApply=Function.prototype.apply;
__nonaRegexpVm.safeCall=Function.prototype.call.bind(Function.prototype.call);
__nonaRegexpVm.arrayBufferConstructor=ArrayBuffer;
__nonaRegexpVm.arrayBufferNumber=Number;
__nonaRegexpVm.arrayBufferTrunc=Math.trunc;
__nonaRegexpVm.arrayBufferMax=Math.max;
__nonaRegexpVm.arrayBufferMin=Math.min;
__nonaRegexpVm.arrayBufferSpecies=Symbol.species;
__nonaRegexpVm.bufferTypeError=TypeError;
__nonaRegexpVm.bufferRangeError=RangeError;
__nonaRegexpVm.arrayBufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get;
__nonaRegexpVm.arrayBufferCopy=ArrayBuffer.__nonaCopyInternal;
delete ArrayBuffer.__nonaCopyInternal;
Object.defineProperty(ArrayBuffer.prototype,'slice',{value:({slice(start,end){
  'use strict';
  var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.arrayBufferLength,this);
  function index(value){
    if(typeof value==='bigint')throw new __nonaRegexpVm.bufferTypeError('Cannot convert BigInt to Number');
    var number=__nonaRegexpVm.arrayBufferNumber(value);
    if(number!==number||number===0)return 0;
    if(number===Infinity)return length;
    if(number===-Infinity)return 0;
    number=__nonaRegexpVm.arrayBufferTrunc(number);
    return number<0?__nonaRegexpVm.arrayBufferMax(length+number,0):__nonaRegexpVm.arrayBufferMin(number,length)
  }
  var first=index(start),final=end===undefined?length:index(end);
  var newLength=Math.max(final-first,0);
  var ctor=this.constructor,species;
  if(ctor===undefined)species=__nonaRegexpVm.arrayBufferConstructor;
  else{
    if(ctor===null||(typeof ctor!=='object'&&typeof ctor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid ArrayBuffer constructor');
    species=ctor[__nonaRegexpVm.arrayBufferSpecies];
    if(species===undefined||species===null)species=__nonaRegexpVm.arrayBufferConstructor
  }
  var result=new species(newLength);
  if(result===this)throw new __nonaRegexpVm.bufferTypeError('ArrayBuffer species returned source buffer');
  var resultLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.arrayBufferLength,result);
  if(resultLength<newLength)throw new __nonaRegexpVm.bufferTypeError('ArrayBuffer species returned a short buffer');
  __nonaRegexpVm.arrayBufferCopy(this,result,first,newLength);
  return result
}}).slice,writable:true,configurable:true});
__nonaRegexpVm.sharedArrayBufferConstructor=SharedArrayBuffer;
__nonaRegexpVm.sharedArrayBufferLength=Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype,'byteLength').get;
Object.defineProperty(SharedArrayBuffer.prototype,'slice',{value:({slice(start,end){
 'use strict';
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.sharedArrayBufferLength,this);
 function index(value){
  if(typeof value==='bigint')throw new __nonaRegexpVm.bufferTypeError('Cannot convert BigInt to Number');
  var number=__nonaRegexpVm.arrayBufferNumber(value);
  if(number!==number||number===0)return 0;
  if(number===Infinity)return length;
  if(number===-Infinity)return 0;
  number=__nonaRegexpVm.arrayBufferTrunc(number);
  return number<0?__nonaRegexpVm.arrayBufferMax(length+number,0):__nonaRegexpVm.arrayBufferMin(number,length)
 }
 var first=index(start),final=end===undefined?length:index(end);
 var newLength=__nonaRegexpVm.arrayBufferMax(final-first,0);
 var ctor=this.constructor,species;
 if(ctor===undefined)species=__nonaRegexpVm.sharedArrayBufferConstructor;
 else{
  if(ctor===null||(typeof ctor!=='object'&&typeof ctor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid SharedArrayBuffer constructor');
  species=ctor[__nonaRegexpVm.arrayBufferSpecies];
  if(species===undefined||species===null)species=__nonaRegexpVm.sharedArrayBufferConstructor
 }
 var result=new species(newLength);
 var resultLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.sharedArrayBufferLength,result);
 if(result===this)throw new __nonaRegexpVm.bufferTypeError('SharedArrayBuffer species returned source buffer');
 if(resultLength<newLength)throw new __nonaRegexpVm.bufferTypeError('SharedArrayBuffer species returned a short buffer');
 __nonaRegexpVm.arrayBufferCopy(this,result,first,newLength);
 return result
}}).slice,writable:true,configurable:true});
__nonaRegexpVm.dvLength=Object.getOwnPropertyDescriptor(DataView.prototype,'byteLength').get;
__nonaRegexpVm.dvGet32=DataView.prototype.getUint32;
__nonaRegexpVm.dvSet32=DataView.prototype.setUint32;
__nonaRegexpVm.dvNumber=Number;
__nonaRegexpVm.dvBigInt=BigInt;
__nonaRegexpVm.dvAsUintN=BigInt.asUintN;
__nonaRegexpVm.dvAsIntN=BigInt.asIntN;
__nonaRegexpVm.dvTrunc=Math.trunc;
__nonaRegexpVm.dvIndex=function(value){
 if(typeof value==='bigint')throw new __nonaRegexpVm.bufferTypeError('Cannot convert BigInt to Number');
 var number=__nonaRegexpVm.dvNumber(value);
 if(number!==number||number===0)return 0;
 if(number===Infinity||number===-Infinity)throw new __nonaRegexpVm.bufferRangeError('Invalid DataView offset');
 number=__nonaRegexpVm.dvTrunc(number);
 if(number<0)throw new __nonaRegexpVm.bufferRangeError('Invalid DataView offset');
 return number
};
__nonaRegexpVm.dvReadBig=function(view,offset,little,signed){
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvLength,view),index=__nonaRegexpVm.dvIndex(offset);
 if(index>length-8)throw new __nonaRegexpVm.bufferRangeError('DataView offset outside buffer');
 var first=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvGet32,view,index,little);
 var second=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvGet32,view,index+4,little);
 var high=little?second:first,low=little?first:second;
 var value=__nonaRegexpVm.dvBigInt(high)*4294967296n+__nonaRegexpVm.dvBigInt(low);
 return signed?__nonaRegexpVm.dvAsIntN(64,value):value
};
__nonaRegexpVm.dvWriteBig=function(view,offset,value,little){
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.dvLength,view),index=__nonaRegexpVm.dvIndex(offset);
 var raw=__nonaRegexpVm.dvAsUintN(64,value);
 if(index>length-8)throw new __nonaRegexpVm.bufferRangeError('DataView offset outside buffer');
 var low=__nonaRegexpVm.dvNumber(raw%4294967296n);
 var high=__nonaRegexpVm.dvNumber(raw/4294967296n);
 if(little){__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index,low,true);__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index+4,high,true)}
 else{__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index,high,false);__nonaRegexpVm.safeCall(__nonaRegexpVm.dvSet32,view,index+4,low,false)}
};
Object.defineProperty(DataView.prototype,'getBigInt64',{value:function getBigInt64(byteOffset){'use strict';return __nonaRegexpVm.dvReadBig(this,byteOffset,!!arguments[1],true)},writable:true,configurable:true});
Object.defineProperty(DataView.prototype,'getBigUint64',{value:function getBigUint64(byteOffset){'use strict';return __nonaRegexpVm.dvReadBig(this,byteOffset,!!arguments[1],false)},writable:true,configurable:true});
Object.defineProperty(DataView.prototype,'setBigInt64',{value:function setBigInt64(byteOffset,value){'use strict';return __nonaRegexpVm.dvWriteBig(this,byteOffset,value,!!arguments[2])},writable:true,configurable:true});
Object.defineProperty(DataView.prototype,'setBigUint64',{value:function setBigUint64(byteOffset,value){'use strict';return __nonaRegexpVm.dvWriteBig(this,byteOffset,value,!!arguments[2])},writable:true,configurable:true});
__nonaRegexpVm.typedArrayValues=Uint8Array.prototype.values;
__nonaRegexpVm.typedArraySort=Array.prototype.sort;
__nonaRegexpVm.bigintToString=BigInt.prototype.toString;
__nonaRegexpVm.typedArrayLocaleString=String;
Object.defineProperty(BigInt.prototype,'toLocaleString',{value:function toLocaleString(){'use strict';return __nonaRegexpVm.safeCall(__nonaRegexpVm.bigintToString,this)},writable:true,configurable:true});
__nonaRegexpVm.typedArrayLength=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'length').get;
__nonaRegexpVm.typedArrayBuffer=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'buffer').get;
__nonaRegexpVm.typedArrayByteOffset=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype),'byteOffset').get;
__nonaRegexpVm.typedArrayConstructor=Object.getPrototypeOf(Uint8Array);
__nonaRegexpVm.typedArrayDefaultConstructor=__nonaRegexpVm.typedArrayConstructor.__nonaDefaultConstructorInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaDefaultConstructorInternal;
__nonaRegexpVm.isTypedArray=__nonaRegexpVm.typedArrayConstructor.__nonaIsTypedArrayInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsTypedArrayInternal;
__nonaRegexpVm.isConstructor=__nonaRegexpVm.typedArrayConstructor.__nonaIsConstructorInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaIsConstructorInternal;
__nonaRegexpVm.typedArrayRawLength=__nonaRegexpVm.typedArrayConstructor.__nonaRawLengthInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaRawLengthInternal;
__nonaRegexpVm.typedArrayRawByteOffset=__nonaRegexpVm.typedArrayConstructor.__nonaRawByteOffsetInternal;
delete __nonaRegexpVm.typedArrayConstructor.__nonaRawByteOffsetInternal;
Object.defineProperty(__nonaRegexpVm.typedArrayConstructor,'from',{value:function from(source){
 'use strict';
 var constructor=this,mapfn=arguments[1],thisArg=arguments[2];
 if(!__nonaRegexpVm.safeCall(__nonaRegexpVm.isConstructor,undefined,constructor))throw new __nonaRegexpVm.bufferTypeError('TypedArray.from requires a constructor');
 if(mapfn!==undefined&&typeof mapfn!=='function')throw new __nonaRegexpVm.bufferTypeError('TypedArray.from mapper is not callable');
 var method=source[Symbol.iterator],values,length,iterated=method!==undefined&&method!==null;
 if(iterated){
  if(typeof method!=='function')throw new __nonaRegexpVm.bufferTypeError('Iterator method is not callable');
  values=[];var iterator=__nonaRegexpVm.safeCall(method,source);
  if(iterator===null||(typeof iterator!=='object'&&typeof iterator!=='function'))throw new __nonaRegexpVm.bufferTypeError('Iterator is not an object');
  var next=iterator.next;
  if(typeof next!=='function')throw new __nonaRegexpVm.bufferTypeError('Iterator next is not callable');
  for(;;){var step=__nonaRegexpVm.safeCall(next,iterator);if(step===null||(typeof step!=='object'&&typeof step!=='function'))throw new __nonaRegexpVm.bufferTypeError('Iterator result is not an object');if(step.done)break;values[values.length]=step.value}
  length=values.length;
 }else{
  var rawLength=+source.length;
  length=rawLength!==rawLength||rawLength<=0?0:rawLength===Infinity?9007199254740991:Math.min(Math.floor(rawLength),9007199254740991);
 }
 var result=new constructor(length);
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,result);
 if(__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,result)<length)throw new __nonaRegexpVm.bufferTypeError('TypedArray.from result is too short');
 for(var k=0;k<length;k++){var value=iterated?values[k]:source[k];if(mapfn!==undefined)value=__nonaRegexpVm.safeCall(mapfn,thisArg,value,k);if(k<__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,result))result[k]=value}
 return result;
},writable:true,configurable:true});
[Uint8Array,Int8Array,Uint8ClampedArray,Uint16Array,Int16Array,Uint32Array,Int32Array,Float32Array,Float64Array,BigInt64Array,BigUint64Array].forEach(function(ctor){delete ctor.prototype[Symbol.toStringTag]});
Object.defineProperty(__nonaRegexpVm.typedArrayConstructor.prototype,Symbol.toStringTag,{get:Object.getOwnPropertyDescriptor({get [Symbol.toStringTag](){'use strict';if(!__nonaRegexpVm.safeCall(__nonaRegexpVm.isTypedArray,undefined,this))return undefined;return __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this).name}},Symbol.toStringTag).get,configurable:true});
Object.defineProperty(__nonaRegexpVm.typedArrayConstructor,Symbol.species,{get:Object.getOwnPropertyDescriptor({get [Symbol.species](){return this}},Symbol.species).get,configurable:true});
__nonaRegexpVm.typedArraySpeciesCreate=function(source,length){
 var defaultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,source);
 var constructor=source.constructor;
 if(constructor===undefined)constructor=defaultConstructor;
 else{
  if(constructor===null||(typeof constructor!=='object'&&typeof constructor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid TypedArray constructor');
  var species=constructor[Symbol.species];
  constructor=species===undefined||species===null?defaultConstructor:species;
 }
 var result=new constructor(length);
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,result);
 if(__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,result)<length)throw new __nonaRegexpVm.bufferTypeError('TypedArray species returned a short result');
 var resultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,result);
 var sourceBig=defaultConstructor===BigInt64Array||defaultConstructor===BigUint64Array;
 var resultBig=resultConstructor===BigInt64Array||resultConstructor===BigUint64Array;
 if(sourceBig!==resultBig)throw new __nonaRegexpVm.bufferTypeError('TypedArray species returned incompatible content type');
 return result;
};
__nonaRegexpVm.typedArraySpeciesCreateView=function(source,buffer,offset,length){
 var defaultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,source);
 var constructor=source.constructor;
 if(constructor===undefined)constructor=defaultConstructor;
 else{
  if(constructor===null||(typeof constructor!=='object'&&typeof constructor!=='function'))throw new __nonaRegexpVm.bufferTypeError('Invalid TypedArray constructor');
  var species=constructor[Symbol.species];
  constructor=species===undefined||species===null?defaultConstructor:species;
 }
 var result=new constructor(buffer,offset,length);
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,result);
 var resultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,result);
 var sourceBig=defaultConstructor===BigInt64Array||defaultConstructor===BigUint64Array;
 var resultBig=resultConstructor===BigInt64Array||resultConstructor===BigUint64Array;
 if(sourceBig!==resultBig)throw new __nonaRegexpVm.bufferTypeError('TypedArray species returned incompatible content type');
 return result;
};
__nonaRegexpVm.typedArrayRelativeIndex=function(value,length){
 var number=+value;
 if(number!==number||number===0)return 0;
 if(number===Infinity)return length;
 if(number===-Infinity)return 0;
 number=__nonaRegexpVm.arrayBufferTrunc(number);
 return number<0?__nonaRegexpVm.arrayBufferMax(length+number,0):__nonaRegexpVm.arrayBufferMin(number,length);
};
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'forEach',{value:function forEach(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this);
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'every',{value:function every(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)if(!__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this))return false;
 return true;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'some',{value:function some(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)if(__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this))return true;
 return false;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'find',{value:function find(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++){var value=this[k];if(__nonaRegexpVm.safeCall(callbackfn,thisArg,value,k,this))return value}
 return undefined;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'findIndex',{value:function findIndex(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var thisArg=arguments[1];
 for(var k=0;k<length;k++)if(__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this))return k;
 return -1;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'reduce',{value:function reduce(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var k=0,accumulator;
 if(arguments.length>1)accumulator=arguments[1];
 else{if(length===0)throw new __nonaRegexpVm.bufferTypeError('Reduce of empty typed array with no initial value');accumulator=this[0];k=1}
 for(;k<length;k++)accumulator=__nonaRegexpVm.safeCall(callbackfn,undefined,accumulator,this[k],k,this);
 return accumulator;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'reduceRight',{value:function reduceRight(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var k=length-1,accumulator;
 if(arguments.length>1)accumulator=arguments[1];
 else{if(length===0)throw new __nonaRegexpVm.bufferTypeError('Reduce of empty typed array with no initial value');accumulator=this[k];k--}
 for(;k>=0;k--)accumulator=__nonaRegexpVm.safeCall(callbackfn,undefined,accumulator,this[k],k,this);
 return accumulator;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'join',{value:function join(separator){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 var sep=separator===undefined?',':''+separator,result='';
 for(var k=0;k<length;k++){
  if(k>0)result+=sep;
  var element=this[k];
  if(element!==undefined)result+=''+element;
 }
 return result;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'toString',{value:Array.prototype.toString,writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'map',{value:function map(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var result=__nonaRegexpVm.typedArraySpeciesCreate(this,length),thisArg=arguments[1];
 for(var k=0;k<length;k++)result[k]=__nonaRegexpVm.safeCall(callbackfn,thisArg,this[k],k,this);
 return result;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'filter',{value:function filter(callbackfn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(typeof callbackfn!=='function')throw new __nonaRegexpVm.bufferTypeError('callbackfn is not callable');
 var kept=[],thisArg=arguments[1];
 for(var k=0;k<length;k++){var value=this[k];if(__nonaRegexpVm.safeCall(callbackfn,thisArg,value,k,this))kept[kept.length]=value}
 var result=__nonaRegexpVm.typedArraySpeciesCreate(this,kept.length);
 for(var i=0;i<kept.length;i++)result[i]=kept[i];
 return result;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'set',{value:function set(source){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var targetLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 var offset=arguments[1];
 var targetOffset=offset===undefined?0:+offset;
 if(targetOffset!==targetOffset)targetOffset=0;
 if(targetOffset===Infinity||targetOffset===-Infinity)throw new __nonaRegexpVm.bufferRangeError('Invalid TypedArray offset');
 targetOffset=__nonaRegexpVm.arrayBufferTrunc(targetOffset);
 if(targetOffset<0)throw new __nonaRegexpVm.bufferRangeError('Invalid TypedArray offset');
 if(source===null||source===undefined)throw new __nonaRegexpVm.bufferTypeError('Source is null or undefined');
 var sourceIsTyped=__nonaRegexpVm.isTypedArray(source);
 var sourceLength,values;
 if(sourceIsTyped){
  __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,source);
  sourceLength=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,source);
  var targetCtor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this);
  var sourceCtor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,source);
  if((targetCtor===BigInt64Array||targetCtor===BigUint64Array)!==(sourceCtor===BigInt64Array||sourceCtor===BigUint64Array))throw new __nonaRegexpVm.bufferTypeError('TypedArray content types differ');
 }else{
  sourceLength=+source.length;
  if(sourceLength!==sourceLength||sourceLength<0)sourceLength=0;
  if(sourceLength===Infinity)sourceLength=9007199254740991;
  sourceLength=__nonaRegexpVm.arrayBufferTrunc(sourceLength);
 }
 if(targetOffset+sourceLength>targetLength)throw new __nonaRegexpVm.bufferRangeError('Source exceeds TypedArray length');
 if(sourceIsTyped){values=[];for(var k=0;k<sourceLength;k++)values[k]=source[k]}
 for(var i=0;i<sourceLength;i++){
  var value=sourceIsTyped?values[i]:source[i];
  if(targetOffset+i<__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this))this[targetOffset+i]=value;
 }
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'subarray',{value:function subarray(begin,end){
 'use strict';
 var length=__nonaRegexpVm.typedArrayRawLength(this);
 var first=__nonaRegexpVm.typedArrayRelativeIndex(begin,length);
 var final=end===undefined?length:__nonaRegexpVm.typedArrayRelativeIndex(end,length);
 var newLength=__nonaRegexpVm.arrayBufferMax(final-first,0);
 var defaultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this);
 var bytesPerElement=defaultConstructor.BYTES_PER_ELEMENT;
 var buffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,this);
 var byteOffset=__nonaRegexpVm.typedArrayRawByteOffset(this)+first*bytesPerElement;
 return __nonaRegexpVm.typedArraySpeciesCreateView(this,buffer,byteOffset,newLength);
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'slice',{value:function slice(start,end){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 var first=__nonaRegexpVm.typedArrayRelativeIndex(start,length);
 var final=end===undefined?length:__nonaRegexpVm.typedArrayRelativeIndex(end,length);
 var count=__nonaRegexpVm.arrayBufferMax(final-first,0);
 var result=__nonaRegexpVm.typedArraySpeciesCreate(this,count);
 if(count>0){
  __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
  var sourceConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,this);
  var resultConstructor=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayDefaultConstructor,undefined,result);
  if(sourceConstructor===resultConstructor){
   var width=sourceConstructor.BYTES_PER_ELEMENT;
   var sourceBuffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,this);
   var resultBuffer=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayBuffer,result);
   var sourceOffset=__nonaRegexpVm.typedArrayRawByteOffset(this)+first*width;
   var resultOffset=__nonaRegexpVm.typedArrayRawByteOffset(result);
   __nonaRegexpVm.arrayBufferCopy(sourceBuffer,resultBuffer,sourceOffset,count*width,resultOffset);
  }else for(var k=0;k<count;k++)result[k]=this[first+k];
 }
 return result;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'sort',{value:function sort(comparefn){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this);
 if(comparefn!==undefined&&typeof comparefn!=='function')throw new __nonaRegexpVm.bufferTypeError('comparefn is not callable');
 var values=[];for(var k=0;k<length;k++)values[k]=this[k];
 var compare=comparefn===undefined?function(x,y){
  if(x!==x)return y!==y?0:1;
  if(y!==y)return -1;
  if(x<y)return -1;
  if(x>y)return 1;
  if(x===0&&y===0){if(1/x<1/y)return -1;if(1/x>1/y)return 1}
  return 0;
 }:function(x,y){var result=+__nonaRegexpVm.safeCall(comparefn,undefined,x,y);return result!==result?0:result};
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArraySort,values,compare);
 for(var i=0;i<length;i++)if(i<__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this))this[i]=values[i];
 return this;
},writable:true,configurable:true});
Object.defineProperty(Object.getPrototypeOf(Uint8Array.prototype),'toLocaleString',{value:function toLocaleString(){
 'use strict';
 __nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayValues,this);
 var length=__nonaRegexpVm.safeCall(__nonaRegexpVm.typedArrayLength,this),result='';
 for(var k=0;k<length;k++){
  if(k>0)result+=',';
  var value=this[k];
  if(value!==undefined&&value!==null){var localized=value.toLocaleString();if(typeof localized==='symbol')throw new __nonaRegexpVm.bufferTypeError('Cannot convert Symbol to string');result+=__nonaRegexpVm.typedArrayLocaleString(localized)}
 }
 return result;
},writable:true,configurable:true});`;
