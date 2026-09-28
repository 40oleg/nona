console.log('sync');
try { new Promise(...[]); } catch (error) { console.log(error.name); }
Promise.resolve(2).then(value => console.log('job', value));
new Promise(...[resolve => resolve(3)]).then(value => console.log('spread', value));
new (Promise.bind(null, resolve => resolve(4)))().then(value => console.log('bound', value));
try { Reflect.construct(Promise.bind(null, 1), [], function Other() {}); }
catch (error) { console.log('bound error', error.name); }
