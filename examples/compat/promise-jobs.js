console.log('sync');
try { new Promise(...[]); } catch (error) { console.log(error.name); }
Promise.resolve(2).then(value => console.log('job', value));
new Promise(...[resolve => resolve(3)]).then(value => console.log('spread', value));
