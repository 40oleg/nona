(function(){
  var intrinsic=typeof __nonaRegexpVm==='function'?__nonaRegexpVm:null;
  var safeSlice=intrinsic?intrinsic.replaceSlice:String.prototype.slice;
  var safeIndexOf=intrinsic?intrinsic.replaceIndexOf:String.prototype.indexOf;
  var safeCharCodeAt=intrinsic?intrinsic.replaceCharCodeAt:String.prototype.charCodeAt;
  var PositionArray=intrinsic?intrinsic.positionArrayConstructor:Uint32Array;
  var ByteArray=intrinsic?intrinsic.byteArrayConstructor:Uint8Array;
  var byteFill=intrinsic?intrinsic.byteArrayFill:Uint8Array.prototype.fill;
  var nativeScan=intrinsic&&intrinsic.regexpScan?intrinsic.regexpScan:null;
  // CreateDataProperty at the end: natively in Nona (captured below as
  // __nonaRegexpVm.append), through a reused descriptor elsewhere.
  var appendDescriptor={value:undefined,writable:true,enumerable:true,configurable:true};
  var nativeAppend=intrinsic&&intrinsic.append?intrinsic.append:function(array,value){appendDescriptor.value=value;Object.defineProperty(array,array.length,appendDescriptor);appendDescriptor.value=undefined};
  function append(array,value){nativeAppend(array,value)}
  // Array.prototype.slice captured before user code runs: CreateDataProperty
  // semantics (no setters on Array.prototype can interfere), one native
  // call instead of a defineProperty per element.
  var arraySlice=Array.prototype.slice;
  function slice(string,start,end){return safeSlice.call(string,start,end)}
  function indexOf(string,value){return safeIndexOf.call(string,value)}
  function charCodeAt(string,index){return safeCharCodeAt.call(string,index)}
  var unicodeData=@@UNICODE_DATA@@;
  var rangeCache={};
  function propertyRanges(name){
    if(typeof rangeCache[name]==='object')return rangeCache[name];
    if(unicodeData.names===null)throw new Error(@@NO_PROPERTIES@@);
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
  function propertyBitmap(ranges){
    if(ranges.bitmap!==undefined)return ranges.bitmap;
    var bitmap=new ByteArray(0x110000);
    for(var i=0;i<ranges.length;i++){
      if(intrinsic)intrinsic.safeCall(byteFill,bitmap,1,ranges[i][0],ranges[i][1]+1);
      else byteFill.call(bitmap,1,ranges[i][0],ranges[i][1]+1)
    }
    ranges.bitmap=bitmap;
    return bitmap
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
  // Compiled patterns are immutable: a regular expression that is executed
  // repeatedly (every global match loop does this) is parsed once.
  var compileCache=new Map();
  function compile(pattern,flags){
    var cacheKey=flags+'/'+pattern,cached=compileCache.get(cacheKey);
    if(cached!==undefined)return cached;
    var compiled=compileUncached(pattern,flags);
    if(compileCache.size>=256)compileCache.clear();
    compileCache.set(cacheKey,compiled);
    return compiled
  }
  function compileUncached(pattern,flags){
    var at=0,groups=0,names=[],totalGroups=0,inClass=false,hasNamedGroup=false;
    for(var scan=0;scan<pattern.length;scan++){
      var mark=pattern[scan];
      if(mark==='\\'){scan++;continue}
      if(inClass){if(mark===']')inClass=false;continue}
      if(mark==='['){inClass=true;continue}
      if(mark==='('&&pattern[scan+1]==='?'&&pattern[scan+2]==='<'&&pattern[scan+3]!=='='&&pattern[scan+3]!=='!')hasNamedGroup=true;
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
      for(var i=0;i<name.length;){
        var point=name.codePointAt(i),valid;
        if(i===0)valid=point===36||point===95||point>=65&&point<=90||point>=97&&point<=122||point>127&&propertyMatch(propertyRanges('ID_Start'),point);
        else valid=point===36||point===95||point>=65&&point<=90||point>=97&&point<=122||point>=48&&point<=57||point===0x200c||point===0x200d||point>127&&propertyMatch(propertyRanges('ID_Continue'),point);
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
          else if(unicode)error();
          // Annex B.1.4 ClassControlLetter: decimal digits and _ also take % 32;
          // otherwise the class holds \\ and the c is read as the next atom.
          else if(control>=48&&control<=57||control===95){cursor++;point=control%32}
          else{cursor--;point=92}
        }
        else if(c==='c'&&!unicode){cursor--;point=92}
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
        at--;return {kind:'char',value:'\\'} // Annex B.1.4: \\ [lookahead = c]
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
        // Unicode mode: \uLEAD\uTRAIL is one code point (RegExpUnicodeEscapeSequence).
        if(c==='u'&&n>=0xd800&&n<=0xdbff&&indexOf(flags,'u')>=0&&pattern[at]==='\\'&&pattern[at+1]==='u'){
          var trail=0,ok=true;
          for(var place=0;place<4;place++){
            var d=charCodeAt(pattern,at+2+place);
            if(d>=48&&d<=57)d-=48;else if(d>=65&&d<=70)d-=55;else if(d>=97&&d<=102)d-=87;else{ok=false;break}
            trail=trail*16+d
          }
          if(ok&&trail>=0xdc00&&trail<=0xdfff){at+=6;return {kind:'char',value:String.fromCharCode(n,trail)}}
        }
        return {kind:'char',value:String.fromCharCode(n)}
      }
      if(c==='k'&&pattern[at]==='<'){
        if(indexOf(flags,'u')<0&&!hasNamedGroup)return {kind:'char',value:'k'};
        at++;
        var name=groupName();
        return {kind:'namedBackref',value:name}
      }
      if(c==='k'&&hasNamedGroup)error();
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
      if(c==='*'||c==='+'||c==='?'||(indexOf(flags,'u')>=0&&(c==='{'||c==='}'||c===']')))error();
      if(c==='{'){
        var probe=at,seen=false;
        while(digit(pattern[probe])){probe++;seen=true}
        if(seen){
          if(pattern[probe]===','){probe++;while(digit(pattern[probe]))probe++}
          if(pattern[probe]==='}')error()
        }
      }
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
          if(node.kind==='look'&&(node.behind||indexOf(flags,'u')>=0))error();
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
    var compiled={tree:tree,groups:groups,flags:flags,names:names,prefix:null,anchored:false,firstUnits:undefined};
    // A pattern whose every alternative starts with ^ (without the m flag) can
    // only match at index 0: search tries no other start position.
    if(indexOf(flags,'m')<0)compiled.anchored=startsAnchored(tree);
    // A pattern that starts with a literal (outside ignore-case and unicode
    // mode) can only match where that literal occurs: execute skips ahead
    // with indexOf instead of trying every position.
    if(indexOf(flags,'i')<0&&indexOf(flags,'u')<0){
      // The whole literal run at the start ('abc' of /abc(\d+)/), so that
      // indexOf skips the positions where only the first character matches.
      var literal=literalPrefix(tree);
      if(literal.text!=='')compiled.prefix=literal.text
    }
    // Otherwise a pattern whose matches must start with one of at most eight
    // code units skips to the next of them with the native scan (#258).
    if(compiled.prefix===null&&!compiled.anchored){
      var unicodeMode=indexOf(flags,'u')>=0,units=firstUnits(tree,indexOf(flags,'i')>=0,unicodeMode);
      // In unicode mode a match never starts inside a surrogate pair, but the
      // scan would stop at the trailing half of one: such sets are not used.
      var usable=!units.nullable&&units.set!==null&&units.set.length>0;
      for(var u=0;usable&&unicodeMode&&u<units.set.length;u++)if(units.set[u]>=0xdc00&&units.set[u]<=0xdfff)usable=false;
      if(usable){
        var text='';
        for(var u=0;u<units.set.length;u++)text+=String.fromCharCode(units.set[u]);
        compiled.firstUnits=text
      }
    }
    return compiled
  }
  // The literal characters every match of node starts with: {text, whole},
  // whole when node is nothing but those characters (a following node then
  // continues the run).
  function literalPrefix(node){
    if(node.kind==='char')return {text:node.value,whole:true};
    if(node.kind==='group')return literalPrefix(node.value);
    if(node.kind==='sequence'){
      var text='';
      for(var i=0;i<node.value.length;i++){
        var part=literalPrefix(node.value[i]);
        text+=part.text;
        if(!part.whole)return {text:text,whole:false}
      }
      return {text:text,whole:true}
    }
    return {text:'',whole:false}
  }
  // The code units a match of node can start with: {set, nullable}. set is
  // null when it is unknown or has more than eight units; nullable when the
  // node can match the empty string (a following node may then supply the
  // first unit). Zero-width assertions are nullable with an empty set.
  function firstUnits(node,ignore,unicode){
    var kind=node.kind;
    if(kind==='char')return {set:charUnits(charCodeAt(node.value,0),ignore,unicode),nullable:false};
    if(kind==='class'){
      if(node.value.inverted)return {set:null,nullable:false};
      var set=[],items=node.value.items;
      for(var i=0;i<items.length&&set!==null;i++){
        var item=items[i];
        if(item.set||item.range&&(item.to-item.from>7||ignore))set=null;
        else if(item.range){for(var p=item.from;p<=item.to&&set!==null;p++)set=unionUnits(set,charUnits(leadUnit(p),ignore,unicode))}
        else set=unionUnits(set,charUnits(leadUnit(item.point),ignore,unicode))
      }
      return {set:set,nullable:false}
    }
    if(kind==='group')return firstUnits(node.value,ignore,unicode);
    if(kind==='anchor'||kind==='boundary'||kind==='look')return {set:[],nullable:true};
    if(kind==='repeat'){
      var inner=firstUnits(node.value,ignore,unicode);
      return {set:inner.set,nullable:inner.nullable||node.min===0}
    }
    if(kind==='sequence'||kind==='alternative'){
      var result={set:[],nullable:kind==='sequence'};
      for(var i=0;i<node.value.length;i++){
        var part=firstUnits(node.value[i],ignore,unicode);
        result.set=result.set===null||part.set===null?null:unionUnits(result.set,part.set);
        if(kind==='sequence'){if(!part.nullable){result.nullable=false;break}}
        else if(part.nullable)result.nullable=true
      }
      if(kind==='alternative'&&node.value.length===0)result.nullable=true;
      return result
    }
    return {set:null,nullable:true}
  }
  // The code units a character (given by its first unit) can match under the
  // flags, or null. Ignore case
  // is handled for ASCII only: in legacy mode no other character
  // canonicalizes to an ASCII one, and in unicode mode only K (KELVIN SIGN)
  // and S (LATIN SMALL LETTER LONG S) fold onto ASCII letters.
  function leadUnit(point){return point>0xffff?0xd800+((point-0x10000)>>10):point}
  function charUnits(unit,ignore,unicode){
    if(!ignore)return [unit];
    if(unit>=128)return null;
    var lower=unit|32;
    if(lower<97||lower>122)return [unit];
    var units=[lower,lower-32];
    if(unicode&&lower===107)append(units,0x212a);
    if(unicode&&lower===115)append(units,0x17f);
    return units
  }
  function unionUnits(set,more){
    if(set===null||more===null)return null;
    var result=arraySlice.call(set);
    for(var i=0;i<more.length;i++){
      var known=false;
      for(var j=0;j<result.length;j++)if(result[j]===more[i])known=true;
      if(!known){if(result.length===8)return null;append(result,more[i])}
    }
    return result
  }
  function startsAnchored(node){
    if(node.kind==='anchor')return node.value==='^';
    if(node.kind==='sequence')return node.value.length>0&&startsAnchored(node.value[0]);
    if(node.kind==='group')return startsAnchored(node.value);
    if(node.kind==='alternative'){
      for(var i=0;i<node.value.length;i++)if(!startsAnchored(node.value[i]))return false;
      return true
    }
    return false
  }
  // Matching runs as a small backtracking program on explicit stacks: no
  // native recursion per character (long inputs cannot exhaust the stack) and
  // no step limit (the specification has none). assemble translates the
  // parsed tree once per compiled pattern.
  //
  // Instructions (operands follow the opcode):
  //   0 MATCH
  //   1..7 atom kind: datum, dir. 1 literal, 2 dot, 3 class, 4 class escape,
  //     5 property, 6 one code unit, 7 any code unit but one.
  //   8 SPLIT first, second   9 JMP target
  //   10 SAVE register        11 GROUP_END group, register, dir
  //   12 ^  13 $  14 \b  15 \B  16 BACKREF group, dir
  //   17 LOOK positive, body, continuation (body ends with MATCH)
  //   18 REPEAT_INIT r
  //   19 REPEAT r, min, max, greedy, clearFrom, clearTo, body, exit
  //   21 REPEAT_ENTER (same operands; resumed after a lazy repeat skipped)
  //   20 REPEAT_END r, min, head
  //   22 SIMPLE_REPEAT kind, datum, dir, min, max, greedy, width (0 = varies)
  // Registers: 2*group and 2*group+1 hold capture bounds; group start
  // positions and repeat counters follow.
  var NONE=4294967295;
  function assemble(compiled){
    var flags=compiled.flags,ignore=indexOf(flags,'i')>=0,unicode=indexOf(flags,'u')>=0;
    var code=[],data=[],registers=compiled.groups*2+2;
    function emit(value){append(code,value)}
    function datum(value){append(data,value);return data.length-1}
    function captureRange(node,range){
      var k=node.kind;
      if(k==='group'){
        if(node.capture!==0){if(node.capture<range[0])range[0]=node.capture;if(node.capture>range[1])range[1]=node.capture}
        captureRange(node.value,range)
      }else if(k==='sequence'||k==='alternative'){
        for(var i=0;i<node.value.length;i++)captureRange(node.value[i],range)
      }else if(k==='repeat'||k==='look')captureRange(node.value,range)
    }
    // [kind, datum, width] for a node that matches one character, or null.
    function atomOf(node){
      var k=node.kind;
      if(k==='char'){
        if(!ignore&&node.value.length===1)return [6,charCodeAt(node.value,0),1];
        return [1,datum(node.value),node.value.length]
      }
      if(k==='dot')return [2,0,unicode?0:1];
      if(k==='class'){
        var spec=node.value;
        if(!unicode&&!ignore&&spec.items.length===1&&!spec.items[0].set&&!spec.items[0].range)return [spec.inverted?7:6,spec.items[0].point,1];
        return [3,datum(spec),unicode?0:1]
      }
      if(k==='classEscape')return [4,datum(node.value),unicode?0:1];
      if(k==='property')return [5,datum({ranges:node.value,negated:node.negated}),0];
      return null
    }
    function gen(node,dir){
      var k=node.kind,i;
      if(k==='sequence'){
        for(i=0;i<node.value.length;i++)gen(node.value[dir<0?node.value.length-1-i:i],dir);
        return
      }
      if(k==='alternative'){
        var jumps=[];
        for(i=0;i<node.value.length;i++){
          if(i===node.value.length-1){gen(node.value[i],dir);break}
          var split=code.length;
          emit(8);emit(split+3);emit(0);
          gen(node.value[i],dir);
          append(jumps,code.length);emit(9);emit(0);
          code[split+2]=code.length
        }
        for(i=0;i<jumps.length;i++)code[jumps[i]+1]=code.length;
        return
      }
      if(k==='group'){
        if(node.capture===0){gen(node.value,dir);return}
        var register=registers++;
        emit(10);emit(register);gen(node.value,dir);emit(11);emit(node.capture);emit(register);emit(dir);
        return
      }
      if(k==='look'){
        var look=code.length;
        emit(17);emit(node.positive?1:0);emit(look+4);emit(0);
        gen(node.value,node.behind?-1:1);emit(0);
        code[look+3]=code.length;
        return
      }
      if(k==='anchor'){emit(node.value==='^'?12:13);return}
      if(k==='boundary'){emit(node.value==='b'?14:15);return}
      if(k==='backref'||k==='namedBackref'){
        var index=node.value;
        if(k==='namedBackref'){
          index=0;
          for(i=0;i<compiled.names.length;i++)if(compiled.names[i].name===node.value)index=compiled.names[i].index
        }
        emit(16);emit(index);emit(dir);
        return
      }
      if(k==='repeat'){
        var min=node.min>=NONE?NONE-1:node.min,max=node.max>=NONE?NONE:node.max;
        var simple=atomOf(node.value);
        if(simple!==null){
          emit(22);emit(simple[0]);emit(simple[1]);emit(dir);emit(min);emit(max);emit(node.lazy?0:1);emit(simple[2]);
          return
        }
        var range=[NONE,0];captureRange(node.value,range);
        var counter=registers;registers+=2;
        emit(18);emit(counter);
        var head=code.length,operands=[counter,min,max,node.lazy?0:1,range[0],range[1],head+18,0];
        emit(19);for(i=0;i<8;i++)emit(operands[i]);
        emit(21);for(i=0;i<8;i++)emit(operands[i]);
        gen(node.value,dir);
        emit(20);emit(counter);emit(min);emit(head);
        code[head+8]=code.length;code[head+17]=code.length;
        return
      }
      var single=atomOf(node);
      emit(single[0]);emit(single[1]);emit(dir)
    }
    gen(compiled.tree,1);emit(0);
    return {code:code,data:data,stateSize:registers,ignore:ignore,unicode:unicode,dotAll:indexOf(flags,'s')>=0,multiline:indexOf(flags,'m')>=0}
  }
  var registerPool=new PositionArray(64),undoPool=new PositionArray(256),framePool=new PositionArray(384);
  // State of the match in progress. Matching never runs user code, so
  // execute is not reentered and the helpers below can share it instead of
  // being recreated as closures on every call.
  var input,length=0,ignore=false,unicode=false,dotAll=false,multiline=false,current=null;
  var code=null,data=null,state=null,undo=null,undoTop=0,frames=null,frameTop=0;
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
  // The same test on a code unit, for the single-unit modes.
  function escapedClassUnit(kind,n){
    var yes=false;
    if(kind==='d'||kind==='D')yes=n>=48&&n<=57;
    else if(kind==='w'||kind==='W')yes=n>=48&&n<=57||n>=65&&n<=90||n>=97&&n<=122||n===95;
    else yes=n>=9&&n<=13||n>=0x2000&&n<=0x200a||
      n===32||n===0xa0||n===0x1680||n===0x2028||n===0x2029||
      n===0x202f||n===0x205f||n===0x3000||n===0xfeff;
    return kind==='D'||kind==='W'||kind==='S'?!yes:yes
  }
  function escapedClass(kind,c){
    var n=charCodeAt(c,0),yes=false;
    if(kind==='d'||kind==='D')yes=n>=48&&n<=57;
    else if(kind==='w'||kind==='W')yes=word(c);
    else yes=n>=9&&n<=13||n>=0x2000&&n<=0x200a||
      n===32||n===0xa0||n===0x1680||n===0x2028||n===0x2029||
      n===0x202f||n===0x205f||n===0x3000||n===0xfeff;
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
  function grow(array,needed){
    var size=array.length*2;
    while(size<needed)size*=2;
    var bigger=new PositionArray(size);
    for(var i=0;i<array.length;i++)bigger[i]=array[i];
    return bigger
  }
  // Every register change is logged so a failed path can be undone.
  function set(index,value){
    if(undoTop+2>undo.length)undo=undoPool=grow(undo,undoTop+2);
    undo[undoTop]=index;undo[undoTop+1]=state[index];undoTop+=2;
    state[index]=value
  }
  function unwind(height){
    while(undoTop>height){undoTop-=2;state[undo[undoTop]]=undo[undoTop+1]}
  }
  // Choice point: kind (0 plain, 1 greedy simple repeat, 2 lazy simple
  // repeat), pc, pos, undo height, count, position after count atoms.
  function push(kind,pc,pos,count,after){
    if(frameTop+6>frames.length)frames=framePool=grow(frames,frameTop+6);
    frames[frameTop]=kind;frames[frameTop+1]=pc;frames[frameTop+2]=pos;frames[frameTop+3]=undoTop;
    frames[frameTop+4]=count;frames[frameTop+5]=after;frameTop+=6
  }
  function clearCaptures(from,to){
    for(var group=from;group<=to;group++){
      if(state[group*2]!==NONE)set(group*2,NONE);
      if(state[group*2+1]!==NONE)set(group*2+1,NONE)
    }
  }
  // One atom at pos in direction dir: the position after it, or -1.
  // Whether the input range [from, to) starts or ends inside a surrogate pair.
  function splitsPair(from,to){
    return isLead(from-1)&&isTrail(from)||isLead(to-1)&&isTrail(to)
  }
  function isLead(i){var c=i>=0&&i<length?charCodeAt(input,i):-1;return c>=0xd800&&c<=0xdbff}
  function isTrail(i){var c=i>=0&&i<length?charCodeAt(input,i):-1;return c>=0xdc00&&c<=0xdfff}
  function atom(kind,datum,pos,dir){
    if(dir<0?pos<=0:pos>=length)return -1;
    var unitIndex=dir<0?pos-1:pos,unit=charCodeAt(input,unitIndex);
    if(kind===6||kind===7){
      if(kind===6?unit!==datum:unit===datum)return -1;
      // Unicode mode reads code points: one unit never matches half of a pair.
      if(unicode&&splitsPair(unitIndex,unitIndex+1))return -1;
      return pos+dir
    }
    if(kind===1){
      var text=data[datum],textLength=text.length,from=dir<0?pos-textLength:pos;
      if(from<0||from+textLength>length)return -1;
      if(ignore){if(!same(slice(input,from,from+textLength),text))return -1}
      else for(var u=0;u<textLength;u++)if(charCodeAt(input,from+u)!==charCodeAt(text,u))return -1;
      if(unicode&&splitsPair(from,from+textLength))return -1;
      return pos+dir*textLength
    }
    var width=1,matched=false;
    if(unicode){
      if(dir<0&&pos>=2){
        var high=charCodeAt(input,pos-2);
        if(unit>=0xdc00&&unit<=0xdfff&&high>=0xd800&&high<=0xdbff)width=2
      }else if(dir>0&&unit>=0xd800&&unit<=0xdbff&&pos+1<length){
        var trail=charCodeAt(input,pos+1);
        if(trail>=0xdc00&&trail<=0xdfff)width=2
      }
    }
    if(kind===2)matched=dotAll||!(unit===10||unit===13||unit===0x2028||unit===0x2029);
    else if(kind===4)matched=unicode?escapedClass(data[datum],input[unitIndex]):escapedClassUnit(data[datum],unit);
    else if(kind===3)matched=classMatch(data[datum],width===1?input[unitIndex]:slice(input,dir<0?pos-2:pos,dir<0?pos:pos+2));
    else{
      var entry=data[datum],point=charCodeAt(input,dir<0?pos-width:pos);
      if(width===2)point=0x10000+(point-0xd800)*1024+(charCodeAt(input,dir<0?pos-1:pos+1)-0xdc00);
      var bitmap=entry.ranges.bitmap;
      if(!ignore&&bitmap!==undefined)matched=(bitmap[point]!==0)!==entry.negated;
      else matched=propertyContains(entry.ranges,point,entry.negated)
    }
    return matched?pos+dir*width:-1
  }
  // One code point back from p towards origin (unicode simple repeats).
  function stepBack(p,origin,dir){
    if(dir>0){
      if(p-2>=origin){
        var low=charCodeAt(input,p-1),high=charCodeAt(input,p-2);
        if(low>=0xdc00&&low<=0xdfff&&high>=0xd800&&high<=0xdbff)return p-2
      }
      return p-1
    }
    if(p+2<=origin){
      var lead=charCodeAt(input,p),tail=charCodeAt(input,p+1);
      if(lead>=0xd800&&lead<=0xdbff&&tail>=0xdc00&&tail<=0xdfff)return p+2
    }
    return p+1
  }
  function terminator(c){return c==='\n'||c==='\r'||c===' '||c===' '}
  // Runs the program from pc at pos: the end position, or -1 with every
  // register change since the call undone. Choice points left by a
  // successful run are dropped, which makes lookarounds atomic.
  function run(pc,pos){
    var base=frameTop,entryUndo=undoTop;
    for(;;){
      var op=code[pc];
      if(op===0){frameTop=base;return pos}
      if(op<=7){
        var next=atom(op,code[pc+1],pos,code[pc+2]);
        if(next>=0){pos=next;pc+=3;continue}
      }
      else if(op===8){push(0,code[pc+2],pos,0,0);pc=code[pc+1];continue}
      else if(op===9){pc=code[pc+1];continue}
      else if(op===10){set(code[pc+1],pos);pc+=2;continue}
      else if(op===11){
        var group=code[pc+1],begin=state[code[pc+2]];
        if(code[pc+3]<0){set(group*2,pos);set(group*2+1,begin)}else{set(group*2,begin);set(group*2+1,pos)}
        pc+=4;continue
      }
      else if(op===12){if(pos===0||multiline&&terminator(input[pos-1])){pc+=1;continue}}
      else if(op===13){if(pos===length||multiline&&terminator(input[pos])){pc+=1;continue}}
      else if(op===14||op===15){if((word(input[pos-1])!==word(input[pos]))===(op===14)){pc+=1;continue}}
      else if(op===16){
        var index=code[pc+1],refDir=code[pc+2];
        if(index<1||index>current.groups)throw new SyntaxError('Invalid backreference');
        var refBegin=state[index*2],refEnd=state[index*2+1];
        if(refBegin===NONE||refEnd===NONE){pc+=3;continue}
        var refLength=refEnd-refBegin,refStart=refDir<0?pos-refLength:pos;
        if(refStart>=0&&refStart+refLength<=length&&same(slice(input,refStart,refStart+refLength),slice(input,refBegin,refEnd))){
          pos+=refDir*refLength;pc+=3;continue
        }
      }
      else if(op===17){
        var lookUndo=undoTop,seen=run(code[pc+2],pos);
        if(code[pc+1]===1){if(seen>=0){pc=code[pc+3];continue}}
        else{if(seen<0){pc=code[pc+3];continue}unwind(lookUndo)}
      }
      else if(op===18){set(code[pc+1],0);pc+=2;continue}
      else if(op===19||op===21){
        var counter=code[pc+1],count=state[counter];
        if(op===19&&count>=code[pc+2]){
          var max=code[pc+3];
          if(max!==NONE&&count>=max){pc=code[pc+8];continue}
          if(code[pc+4]===1)push(0,code[pc+8],pos,0,0);
          else{push(0,pc+9,pos,0,0);pc=code[pc+8];continue}
        }
        clearCaptures(code[pc+5],code[pc+6]);
        set(counter+1,pos);pc=code[pc+7];continue
      }
      else if(op===20){
        // An iteration past the minimum that matched the empty string fails.
        var endCounter=code[pc+1],done=state[endCounter];
        if(!(done>=code[pc+2]&&pos===state[endCounter+1])){set(endCounter,done+1);pc=code[pc+3];continue}
      }
      else{
        // Repeat of a single-character atom: take as many (greedy) or as few
        // (lazy) as possible, then give back or take more one at a time.
        var kind=code[pc+1],item=code[pc+2],dir=code[pc+3],min=code[pc+4],limit=code[pc+5],greedy=code[pc+6];
        var taken=0,at=pos;
        if(kind===5&&!ignore&&(dir<0?at:length-at)>1024)propertyBitmap(data[item].ranges);
        var most=greedy===1?limit:min;
        while(most===NONE||taken<most){var after=atom(kind,item,at,dir);if(after<0)break;at=after;taken++}
        if(taken>=min){
          if(greedy===1){if(taken>min)push(1,pc+8,pos,taken,at)}
          else if(limit===NONE||taken<limit)push(2,pc+8,pos,taken,at);
          pos=at;pc+=8;continue
        }
      }
      // Failure: resume at the newest choice point of this run.
      for(;;){
        if(frameTop===base){unwind(entryUndo);return -1}
        if(++backtracks>backtrackBudget&&switchToPike()){frameTop=base;unwind(entryUndo);return -2}
        frameTop-=6;
        var frameKind=frames[frameTop];
        unwind(frames[frameTop+3]);
        pc=frames[frameTop+1];pos=frames[frameTop+2];
        if(frameKind===0)break;
        var have=frames[frameTop+4],reached=frames[frameTop+5];
        var repeatKind=code[pc-7],repeatItem=code[pc-6],repeatDir=code[pc-5],repeatWidth=code[pc-1];
        if(frameKind===1){
          reached=repeatWidth!==0?reached-repeatDir*repeatWidth:stepBack(reached,pos,repeatDir);
          have--;
          if(have>code[pc-4])push(1,pc,pos,have,reached);
          pos=reached;break
        }
        var further=atom(repeatKind,repeatItem,reached,repeatDir);
        if(further<0)continue;
        have++;
        if(code[pc-3]===NONE||have<code[pc-3])push(2,pc,pos,have,further);
        pos=further;break
      }
    }
  }
  // Linear-time fallback (Pike VM). The backtracker above is exact but can
  // take exponential time ((a+)+b on a run of a's). After a budget of
  // backtracking steps, a pattern without backreferences or lookarounds,
  // whose optional iterations cannot match the empty string, and outside
  // unicode mode (where every atom consumes one code unit) is
  // matched again by simulating all its paths in parallel: one list of
  // threads per input position, kept in priority order so the leftmost,
  // highest-priority match is the one backtracking would find, and each
  // instruction visited at most once per position, so the time is linear in
  // the input. Captures are per-thread registers.
  //
  // Instructions: 0 MATCH; 1-7 atom kind, datum; 8 SPLIT first, second;
  // 9 JMP target; 10 SAVE register; 11 GROUP_END group, register;
  // 12-15 assertions (as above); 23 CLEAR from, to (captures of an
  // iteration); 24 MARK register (iteration start); 25 PROGRESS register
  // (an iteration past the minimum that matched nothing fails).
  var backtrackBudget=1000000,backtracks=0;
  function pikeCompile(compiled){
    var flags=compiled.flags,ignore=indexOf(flags,'i')>=0;
    if(indexOf(flags,'u')>=0)return null;
    var code=[],pdata=[],registers=compiled.groups*2+2,limit=20000,ineligible=false;
    function emit(value){append(code,value)}
    function datum(value){append(pdata,value);return pdata.length-1}
    function range(node,out){
      var k=node.kind;
      if(k==='group'){if(node.capture!==0){if(node.capture<out[0])out[0]=node.capture;if(node.capture>out[1])out[1]=node.capture}range(node.value,out)}
      else if(k==='sequence'||k==='alternative'){for(var i=0;i<node.value.length;i++)range(node.value[i],out)}
      else if(k==='repeat'||k==='look')range(node.value,out)
    }
    // Whether a node can match the empty string. Threads are merged per
    // instruction and position, which is exact only when an iteration past
    // the minimum always consumes input: then its progress check never
    // decides, and two threads at the same place have the same future.
    function nullable(node){
      var k=node.kind,i;
      if(k==='char'||k==='dot'||k==='class'||k==='classEscape'||k==='property')return false;
      if(k==='sequence'){for(i=0;i<node.value.length;i++)if(!nullable(node.value[i]))return false;return true}
      if(k==='alternative'){for(i=0;i<node.value.length;i++)if(nullable(node.value[i]))return true;return false}
      if(k==='group')return nullable(node.value);
      if(k==='repeat')return node.min===0||nullable(node.value);
      return true
    }
    function gen(node){
      if(ineligible||code.length>limit){ineligible=true;return}
      var k=node.kind,i;
      if(k==='repeat'&&node.max>node.min&&nullable(node.value)){ineligible=true;return}
      if(k==='sequence'){for(i=0;i<node.value.length;i++)gen(node.value[i]);return}
      if(k==='alternative'){
        var jumps=[];
        for(i=0;i<node.value.length;i++){
          if(i===node.value.length-1){gen(node.value[i]);break}
          var split=code.length;emit(8);emit(split+3);emit(0);
          gen(node.value[i]);append(jumps,code.length);emit(9);emit(0);code[split+2]=code.length
        }
        for(i=0;i<jumps.length;i++)code[jumps[i]+1]=code.length;
        return
      }
      if(k==='group'){
        if(node.capture===0){gen(node.value);return}
        var register=registers++;emit(10);emit(register);gen(node.value);emit(11);emit(node.capture);emit(register);return
      }
      if(k==='anchor'){emit(node.value==='^'?12:13);return}
      if(k==='boundary'){emit(node.value==='b'?14:15);return}
      if(k==='look'||k==='backref'||k==='namedBackref'){ineligible=true;return}
      if(k==='repeat'){
        var min=node.min,max=node.max,lazy=node.lazy,captures=[NONE,0];range(node.value,captures);
        var clear=function(){if(captures[0]<=captures[1]){emit(23);emit(captures[0]);emit(captures[1])}};
        for(i=0;i<min;i++){clear();gen(node.value);if(ineligible)return}
        var mark=registers++;
        if(max===Infinity){
          var head=code.length;emit(8);emit(0);emit(0);
          var body=code.length;emit(24);emit(mark);clear();gen(node.value);emit(25);emit(mark);emit(9);emit(head);
          var exit=code.length;
          if(lazy){code[head+1]=exit;code[head+2]=body}else{code[head+1]=body;code[head+2]=exit}
          return
        }
        var exits=[];
        for(i=min;i<max;i++){
          var choice=code.length;emit(8);emit(0);emit(0);append(exits,choice);
          var start=code.length;emit(24);emit(mark);clear();gen(node.value);emit(25);emit(mark);if(ineligible)return;
          code[choice+(lazy?2:1)]=start
        }
        for(i=0;i<exits.length;i++)code[exits[i]+(lazy?1:2)]=code.length;
        return
      }
      // A single atom: the same kinds as the backtracker (char text is one unit here).
      if(k==='char'){if(!ignore&&node.value.length===1){emit(6);emit(charCodeAt(node.value,0))}else{emit(1);emit(datum(node.value))}return}
      if(k==='dot'){emit(2);emit(0);return}
      if(k==='class'){emit(3);emit(datum(node.value));return}
      if(k==='classEscape'){emit(4);emit(datum(node.value));return}
      if(k==='property'){emit(5);emit(datum({ranges:node.value,negated:node.negated}));return}
      ineligible=true
    }
    gen(compiled.tree);emit(0);
    if(ineligible)return null;
    return {code:code,data:pdata,registers:registers}
  }
  // Runs the Pike program from start; returns the backtracker's result shape.
  function pikeSearch(compiled,pike,start,sticky){
    var pcode=pike.code,count=pike.registers,size=pcode.length;
    var savedData=data;data=pike.data;
    // Thread lists: program counters and register arrays, in priority order.
    var cpc=[],cregs=[],npc=[],nregs=[],seen=new PositionArray(size),generation=0;
    var matched=null,matchEnd=-1;
    function assertion(op,pos){
      if(op===12)return pos===0||multiline&&terminator(input[pos-1]);
      if(op===13)return pos===length||multiline&&terminator(input[pos]);
      return (word(input[pos-1])!==word(input[pos]))===(op===14)
    }
    // Follows the instructions that consume nothing, depth first in
    // priority order, and lists the threads that wait on an atom or match.
    function add(pcs,regsList,pc,regs,pos){
      if(seen[pc]===generation)return;
      seen[pc]=generation;
      var op=pcode[pc];
      if(op===9){add(pcs,regsList,pcode[pc+1],regs,pos);return}
      if(op===8){add(pcs,regsList,pcode[pc+1],regs,pos);add(pcs,regsList,pcode[pc+2],regs,pos);return}
      if(op===10||op===24){var saved=arraySlice.call(regs);saved[pcode[pc+1]]=pos;add(pcs,regsList,pc+2,saved,pos);return}
      if(op===11){var ended=arraySlice.call(regs),group=pcode[pc+1];ended[group*2]=regs[pcode[pc+2]];ended[group*2+1]=pos;add(pcs,regsList,pc+3,ended,pos);return}
      if(op===23){var cleared=arraySlice.call(regs);for(var g=pcode[pc+1];g<=pcode[pc+2];g++){cleared[g*2]=NONE;cleared[g*2+1]=NONE}add(pcs,regsList,pc+3,cleared,pos);return}
      if(op===25){if(regs[pcode[pc+1]]!==pos)add(pcs,regsList,pc+2,regs,pos);return}
      if(op>=12&&op<=15){if(assertion(op,pos))add(pcs,regsList,pc+1,regs,pos);return}
      append(pcs,pc);append(regsList,regs)
    }
    // Register 0 (unused by captures) holds where the thread's match began.
    function initial(at){var regs=[];for(var r=0;r<count;r++)append(regs,NONE);regs[0]=at;return regs}
    generation++;add(cpc,cregs,0,initial(start),start);
    for(var pos=start;;pos++){
      generation++;
      for(var t=0;t<cpc.length;t++){
        var pc=cpc[t],op=pcode[pc];
        if(op===0){matched=cregs[t];matchEnd=pos;break}
        if(pos<length&&atom(op,pcode[pc+1],pos,1)===pos+1)add(npc,nregs,pc+2,cregs[t],pos+1)
      }
      if(pos>=length)break;
      if(matched===null&&!sticky)add(npc,nregs,0,initial(pos+1),pos+1);
      // No thread left: done once a match exists (or the search is anchored);
      // otherwise the next position is still tried.
      if(npc.length===0&&(matched!==null||sticky))break;
      cpc=npc;cregs=nregs;npc=[];nregs=[]
    }
    data=savedData;
    if(matched===null)return null;
    var captures=new PositionArray(compiled.groups*2+2);
    for(var c=2;c<captures.length;c++)captures[c]=matched[c];
    return {end:matchEnd,captures:captures,start:matched[0]}
  }
  // Past the budget: use the Pike VM if the pattern allows it (compiled once).
  function switchToPike(){
    var program=current.program;
    if(program.pike===undefined)program.pike=pikeCompile(current);
    if(program.pike===null){backtracks=-Infinity;return false}
    return true
  }
  function execute(compiled,subject,start,sticky){
    backtracks=0;
    var program=compiled.program;
    if(program===undefined){program=assemble(compiled);compiled.program=program}
    ignore=program.ignore;unicode=program.unicode;dotAll=program.dotAll;multiline=program.multiline;
    code=program.code;data=program.data;current=compiled;input=subject;length=subject.length;
    var stateSize=program.stateSize;
    if(stateSize>registerPool.length)registerPool=new PositionArray(stateSize*2);
    state=registerPool;undo=undoPool;frames=framePool;
    var result=search(compiled,stateSize,start,sticky);
    input=undefined;current=null;
    return result
  }
  function search(compiled,stateSize,start,sticky){
    if(unicode&&start>0&&start<length){
      var low=charCodeAt(input,start),high=charCodeAt(input,start-1);
      if(low>=0xdc00&&low<=0xdfff&&high>=0xd800&&high<=0xdbff)start--
    }
    var prefix=sticky?null:compiled.prefix;
    var anchored=compiled.anchored;
    var scan=sticky||nativeScan===null?undefined:compiled.firstUnits;
    for(var candidate=start;candidate<=length;candidate++){
      if(anchored&&candidate>0)return null;
      if(prefix!==null){
        var found=safeIndexOf.call(input,prefix,candidate);
        if(found<0)return null;
        candidate=found
      }else if(scan!==undefined){
        var next=nativeScan(input,candidate,scan);
        if(next===-1)return null;
        if(typeof next==='number')candidate=next
      }
      for(var s=0;s<stateSize;s++)state[s]=NONE;
      undoTop=0;frameTop=0;
      var end=run(0,candidate);
      if(end===-2)return pikeSearch(compiled,compiled.program.pike,candidate,sticky||anchored);
      if(end>=0){
        // Capture bounds as registers: 4294967295 marks a group that did not
        // participate (slots 0 and 1 are unused).
        var captures=new PositionArray(compiled.groups*2+2);
        for(var c=2;c<captures.length;c++)captures[c]=state[c];
        return {end:end,captures:captures,start:candidate}
      }
      if(sticky)break;
      if(unicode&&candidate+1<length){
        var leading=charCodeAt(input,candidate),trailing=charCodeAt(input,candidate+1);
        if(leading>=0xd800&&leading<=0xdbff&&trailing>=0xdc00&&trailing<=0xdfff)candidate++
      }
    }
    return null
  }
  // The indices property of a match result for the d flag
  // (MakeMatchIndicesIndexPairArray): [start, end] per capture or undefined,
  // and a groups object (or undefined).
  function indices(result,compiled,matched){
    if(indexOf(compiled.flags,'d')<0)return;
    var captures=matched.captures,pairs=[],groups=undefined;
    append(pairs,[matched.start,matched.end]);
    for(var i=1;i<=compiled.groups;i++)append(pairs,captures[i*2]===4294967295?undefined:[captures[i*2],captures[i*2+1]]);
    if(compiled.names.length){
      groups=Object.create(null);
      for(var i=0;i<compiled.names.length;i++){
        var at=compiled.names[i].index*2;
        groups[compiled.names[i].name]=captures[at]===4294967295?undefined:[captures[at],captures[at+1]]
      }
    }
    appendDescriptor.value=groups;Object.defineProperty(pairs,'groups',appendDescriptor);
    appendDescriptor.value=pairs;Object.defineProperty(result,'indices',appendDescriptor);
    appendDescriptor.value=undefined
  }
  // setBacktrackBudget is for tests: 0 switches to the Pike VM at the first backtrack.
  return {compile:compile,execute:execute,indices:indices,setBacktrackBudget:function(steps){backtrackBudget=steps}}
})()