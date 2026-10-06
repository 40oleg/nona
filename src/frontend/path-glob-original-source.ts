/** Original Nona glob parser and matcher; behavioral oracle: Node.js. */
export const pathGlobOriginalSource=String.raw`
function globBraces(pattern){
 let open=-1,depth=0,close=-1;
 for(let i=0;i<pattern.length;i++){if(pattern[i]==='{'){if(depth===0)open=i;depth++;}else if(pattern[i]==='}'&&depth){depth--;if(depth===0){close=i;break;}}}
 if(close<0)return [pattern];
 const body=pattern.slice(open+1,close),choices=[];let begin=0;depth=0;
 for(let i=0;i<body.length;i++){if(body[i]==='{')depth++;else if(body[i]==='}')depth--;else if(body[i]===','&&!depth){choices.push(body.slice(begin,i));begin=i+1;}}
 if(choices.length){choices.push(body.slice(begin));if(open===0&&close===pattern.length-1)for(let i=choices.length-1;i>=0;i--)if(choices[i]==='')choices.splice(i,1);}
 else{
  const range=body.split('..');
  if(range.length===2||range.length===3){
   const numeric=/^-?\d+$/.test(range[0])&&/^-?\d+$/.test(range[1]),alpha=range[0].length===1&&range[1].length===1;
   if(numeric||alpha){
    const first=numeric?Number(range[0]):range[0].charCodeAt(0),last=numeric?Number(range[1]):range[1].charCodeAt(0),step=range.length===3?Math.abs(Number(range[2])):1;
    if(step>0&&Number.isFinite(step)){
     const width=Math.max(range[0].replace('-','').length,range[1].replace('-','').length),padding=numeric&&(/^0\d/.test(range[0])||/^0\d/.test(range[1]));
     for(let n=first;first<=last?n<=last:n>=last;n+=first<=last?step:-step){let value=numeric?String(Math.abs(n)):String.fromCharCode(n);if(padding)while(value.length<width)value='0'+value;if(numeric&&n<0)value='-'+value;choices.push(value);if(choices.length>100000)throw new RangeError('Glob brace range is too large');}
    }
   }
  }
 }
 if(!choices.length)return globBraces(pattern.slice(close+1)).map(x=>pattern.slice(0,close+1)+x);
 const result=[];for(const choice of choices)for(const value of globBraces(pattern.slice(0,open)+choice+pattern.slice(close+1)))result.push(value);return result;
}
function globParseSegment(pattern){
 let index=0;
 function sequence(group){
  const tokens=[];
  while(index<pattern.length){
   const char=pattern[index];if(group&&(char==='|'||char===')'))break;
   if('@+?!*'.includes(char)&&pattern[index+1]==='('){
    const saved=index;index+=2;const branches=[];
    while(true){branches.push(sequence(true));if(pattern[index]==='|'){index++;continue;}break;}
    if(pattern[index]===')'){index++;tokens.push({kind:'group',operator:char,branches:branches});continue;}index=saved;
   }
   if(char==='*'){if(!tokens.length||tokens[tokens.length-1].kind!=='many')tokens.push({kind:'many'});index++;continue;}
   if(char==='?'){tokens.push({kind:'one'});index++;continue;}
   if(char==='['){
    let end=index+1;if(pattern[end]==='!'||pattern[end]==='^')end++;if(pattern[end]===']')end++;
    while(end<pattern.length&&pattern[end]!==']'){if(pattern[end]==='['&&pattern[end+1]===':'){const inner=pattern.indexOf(':]',end+2);if(inner>=0){end=inner+2;continue;}}end++;}
    if(end<pattern.length){
     let body=pattern.slice(index+1,end);if(body[0]==='!')body='^'+body.slice(1);
     const classes={alnum:'\\p{L}\\p{N}',alpha:'\\p{L}',ascii:'\\x00-\\x7f',blank:'\\t ',cntrl:'\\p{Cc}',digit:'\\p{Nd}',graph:'\\p{L}\\p{M}\\p{N}\\p{P}\\p{S}',lower:'\\p{Ll}',print:'\\p{L}\\p{M}\\p{N}\\p{P}\\p{S}\\p{Zs}',punct:'\\p{P}',space:'\\s',upper:'\\p{Lu}',word:'\\p{L}\\p{N}_',xdigit:'0-9A-Fa-f'};
     let unicode=false;for(const name of Object.keys(classes))if(body.includes('[:'+name+':]')){body=body.split('[:'+name+':]').join(classes[name]);unicode=true;}
     if(body[0]===']')body='\\]'+body.slice(1);else if(body.startsWith('^]'))body='^\\]'+body.slice(2);
     try{const regex=new RegExp('^['+body+']$',unicode?'u':'');tokens.push({kind:'class',regex:regex,unicode:unicode});index=end+1;continue;}catch(error){}
    }
   }
   tokens.push({kind:'literal',value:char});index++;
  }
  return tokens;
 }
 return sequence(false);
}
function globSegmentMatch(text,pattern,nocase){
 let tokens=globParseSegment(pattern);
 if(nocase&&tokens.some(token=>token.kind!=='literal')){text=text.toLowerCase();pattern=pattern.toLowerCase();tokens=globParseSegment(pattern);}
 // A nullable leading group can expose an unguarded following token.
 function allowsDot(sequence){for(let i=0;i<sequence.length;i++){const token=sequence[i];if(token.kind==='literal')return token.value==='.';if(token.kind!=='group'||token.operator==='!')return false;if(token.branches.some(branch=>allowsDot(branch)))return true;if(token.operator!=='?'&&token.operator!=='*')return false;if(i+1<sequence.length)return true;}return false;}
 if(text[0]==='.'&&!allowsDot(tokens))return false;
 function exposesTail(sequence){if(!sequence.length||sequence[0].kind!=='group')return false;const group=sequence[0];if(group.operator==='!')return false;if(sequence.length>1&&(group.operator==='?'||group.operator==='*'))return true;return group.branches.some(branch=>exposesTail(branch));}
 const nullablePrefix=exposesTail(tokens);
 if((text==='.'||text==='..')&&!nullablePrefix&&pattern!==text&&/[?*\[]/.test(pattern))return false;
 function negativeTail(sequence){if(!sequence.length)return false;const token=sequence[sequence.length-1];return token.kind==='group'&&(token.operator==='!'||token.branches.some(branch=>negativeTail(branch)));}
 function allowsEmpty(sequence,selected){if(!sequence.length)return !selected;if(sequence.length!==1)return true;const token=sequence[0];if(token.kind==='many')return false;if(token.kind!=='group')return true;if(token.operator==='+')return token.branches.some(branch=>negativeTail(branch));if(token.operator==='?')return !selected;if(token.operator==='@')return token.branches.some(branch=>allowsEmpty(branch,true));return true;}
 if(!text&&!allowsEmpty(tokens,false))return false;
 function ends(sequence,start){
  let positions=[start];
  for(let tokenIndex=0;tokenIndex<sequence.length;tokenIndex++){
   const token=sequence[tokenIndex];
   const next=[];
   for(const position of positions){
    if(token.kind==='literal'){if(text[position]===token.value)next.push(position+1);}
    else if(token.kind==='one'){if(position<text.length)next.push(position+1);}
    else if(token.kind==='class'){if(position<text.length){const char=token.unicode?String.fromCodePoint(text.codePointAt(position)):text[position];if(token.regex.test(char))next.push(position+char.length);}}
    else if(token.kind==='many'){for(let end=position;end<=text.length;end++)next.push(end);}
    else{
     // A positive group at the end of an exclusion leaves a nonempty wildcard.
     const finalBranch=token.branches[token.branches.length-1],finalToken=finalBranch[finalBranch.length-1];
     const openNegation=token.operator==='!'&&finalToken&&finalToken.kind==='group'&&finalToken.operator!=='!';
     const matches=[];if(openNegation)matches.push(position);else for(const branch of token.branches)matches.push(...ends(branch,position));
     if(token.operator==='@')next.push(...matches);
     else if(token.operator==='?')next.push(position,...matches);
     else if(token.operator==='!'){
      const suffix=sequence.slice(tokenIndex+1);let blocked=false;
      for(const branch of openNegation?[[]]:token.branches)for(const end of ends(branch,position)){
       // The exclusion suffix consisting solely of * requires a character.
       if(suffix.length===1&&suffix[0].kind==='many'&&end===text.length)continue;
       if(ends(suffix,end).includes(text.length))blocked=true;
      }
      // Exclusion applies to the remaining text; nested callers need all ends.
      if(!blocked)for(let end=openNegation?position+1:position;end<=text.length;end++)next.push(end);
     }
     else{const queue=token.operator==='*'?[position]:matches.slice(),seen=[];while(queue.length){const end=queue.shift();if(seen.includes(end))continue;seen.push(end);next.push(end);for(const branch of token.branches)for(const further of ends(branch,end))if(further>end)queue.push(further);}}
    }
   }
   positions=Array.from(new Set(next));if(!positions.length)break;
  }
  return positions;
 }
 return ends(tokens,0).includes(text.length);
}
function globPatternParts(pattern){
 const parts=pattern.split('/').filter((x,i,a)=>x!==''||i===0||i===a.length-1),result=[];
 for(let i=0;i<parts.length;i++){const part=parts[i];if(part==='.'&&result.length&&i<parts.length-1)continue;if(part==='..'&&result.length&&result[result.length-1]!==''&&result[result.length-1]!=='..'&&result[result.length-1]!=='**')result.pop();else result.push(part);}return result;
}
function pathGlobMatch(text,pattern,windows){
 pattern=pattern.split('\\').join('/');if(windows)text=text.split('\\').join('/');
 const nocase=pathHost.platform==='win32'||pathHost.platform==='darwin',paths=globPatternParts(text);
 for(const expanded of globBraces(pattern)){
  const patterns=globPatternParts(expanded),memo=new Map();
  if(windows&&expanded.startsWith('//')!==text.startsWith('//')&&expanded[0]==='/')continue;
  function match(pi,si){
   const key=pi+':'+si;if(memo.has(key))return memo.get(key);let answer=false;
   if(pi===patterns.length)answer=si===paths.length||(si===paths.length-1&&paths[si]==='');
   else if(patterns[pi]==='**'){if(pi===patterns.length-1)answer=(pi===0||si<paths.length)&&paths.slice(si).every(part=>part!=='.'&&part!=='..'&&part[0]!=='.');else if(match(pi+1,si))answer=true;else if(si<paths.length&&paths[si]!=='.'&&paths[si]!=='..'&&paths[si][0]!=='.')answer=match(pi,si+1);}
   else if(si<paths.length&&(windows&&pi===0&&/^[A-Za-z]:$/.test(patterns[pi])?paths[si].toLowerCase()===patterns[pi].toLowerCase():globSegmentMatch(paths[si],patterns[pi],nocase)))answer=match(pi+1,si+1);
   memo.set(key,answer);return answer;
  }
  if(match(0,0))return true;
 }
 return false;
}
`;
