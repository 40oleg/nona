function f(a){let s=0; for(let i=0;i<a.length;i++) s+=a[i]*a[i]; return s}
function g(a,n){for(let i=0;i<n;i++) a[i]=i*0.5; return a}
console.log(f(new Float64Array(3)), g(new Float64Array(4),4));
