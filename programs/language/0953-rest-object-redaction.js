function publicRecord({password,token,profile:{email,...profile},...identity}) {
  return {...identity,profile,contact:email.split('@')[1]};
}
const privateRows = [
  {id:1,password:'secret',token:'key',profile:{email:'ada@example.test',name:'Ada',city:'Oslo'}},
  {id:2,password:'hidden',profile:{email:'bo@sample.test',name:'Bo'}}
];
const publicRows = privateRows.map(publicRecord);
console.log(JSON.stringify(publicRows));
console.log(privateRows[0].profile.email);
